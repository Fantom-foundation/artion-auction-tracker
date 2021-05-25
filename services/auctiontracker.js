const mongoose = require('mongoose')
const Auction = mongoose.model('Auction')
const Account = mongoose.model('Account')
const Bid = mongoose.model('Bid')
const ERC721TOKEN = mongoose.model('ERC721TOKEN')
const TradeHistory = mongoose.model('TradeHistory')

const contractutils = require('../utils/contracts.utils')
const auctionSC = contractutils.loadContractFromAddress()

const MailService = require('../utils/mailer')

const toLowerCase = (val) => {
  if (val) return val.toLowerCase()
  else return val
}

const parseToFTM = (inWei) => {
  return parseFloat(inWei.toString()) / 10 ** 18
}

const trackAuction = () => {
  console.log('auction tracker has been started')

  auctionSC.on('AuctionCreated', async (nftAddress, tokenID) => {
    try {
      nftAddress = toLowerCase(nftAddress)
      await Auction.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      let auction = new Auction()
      auction.minter = toLowerCase(nftAddress)
      auction.tokenID = tokenID
      auction.bidder = 0
      await auction.save()
    } catch (error) {}
  })

  auctionSC.on(
    'UpdateAuctionStartTime',
    async (nftAddress, tokenID, startTime) => {
      nftAddress = toLowerCase(nftAddress)
      tokenID = parseInt(tokenID)
      // update saleEndsAt for 712 tk
      try {
        let tk = await ERC721TOKEN.findOne({
          contractAddress: nftAddress,
          tokenID: tokenID,
        })
        if (tk) {
          tk.saleEndsAt = new Date(parseInt(startTime) * 1000)
        }
      } catch (error) {}
      try {
        let auction = await Auction.findOne({
          minter: toLowerCase(nftAddress),
          tokenID: tokenID,
          endTime: { $gt: Date.now() },
        })
        if (auction) {
          auction.startTime = new Date(startTime)
          await auction.save()
        }
      } catch (error) {}
    },
  )

  auctionSC.on(
    'UpdateAuctionReservePrice',
    async (nftAddress, tokenID, reservePrice) => {
      reservePrice = parseToFTM(reservePrice)
      try {
        nftAddress = toLowerCase(nftAddress)
        // update the price
        let token = await ERC721TOKEN.findOne({
          contractAddress: nftAddress,
          tokenID: tokenID,
        })
        if (token) {
          token.price = reservePrice
          token.saleEndsAt = new Date()
          await token.save()
        }
        let bid = await Bid.findOne({
          minter: nftAddress,
          tokenID: tokenID,
        })
        if (bid) {
          let bidder = toLowerCase(bid.bidder)
          console.log('bidder')
          console.log(bidder)
          let account = await Account.findOne({ address: bidder })
          if (account) {
            try {
              await MailService.sendEmail(
                account.email,
                'NFT Auction Price Updated',
                `Dear ${account.alias}, you are getting this email because the nft you has bidded has updated in it's price to ${reservePrice} FTM`,
              )
            } catch (error) {
              console.log('cannot send email, update price')
            }
          }
        }
      } catch (error) {}
    },
  )

  auctionSC.on('BidPlaced', async (nftAddress, tokenID, bidder, bid) => {
    try {
      nftAddress = toLowerCase(nftAddress)
      bidder = toLowerCase(bidder)
      bid = parseToFTM(bid)
      await Bid.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      let newBid = new Bid()
      newBid.minter = nftAddress
      newBid.tokenID = tokenID
      newBid.bidder = bidder
      newBid.bid = bid
      await newBid.save()
      let tk = await ERC721TOKEN.findOne({
        tokenID: tokenID,
        contractAddress: nftAddress,
      })
      if (tk) {
        let address = tk.owner
        let account = await Account.findOne({ address: address })
        if (account) {
          try {
            await MailService.sendEmail(
              account.email,
              'You got a bid for your NFT',
              `Dear ${account.alias}, you are getting this email because your nft item got a bid from ${bidder} with the price of ${bid} FTM`,
            )
          } catch (error) {}
        }
      }
    } catch (error) {}
  })

  auctionSC.on('BidWithdrawn', async (nftAddress, tokenID, bidder, bid) => {
    bid = parseToFTM(bid)
    try {
      nftAddress = toLowerCase(nftAddress)
      bidder = toLowerCase(bidder)
      await Bid.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      let tk = await ERC721TOKEN.findOne({
        tokenID: tokenID,
        contractAddress: nftAddress,
      })
      if (tk) {
        let address = tk.owner
        console.log(address)
        let account = await Account.findOne({ address: address })
        if (account) {
          try {
            await MailService.sendEmail(
              account.email,
              'You got a bid withdrawn from your NFT',
              `Dear ${account.alias}, you are getting this email because your nft item has lost a bid from ${bidder} with the price of ${bid} FTM`,
            )
          } catch (error) {}
        }
      } else {
      }
    } catch (error) {}
  })

  auctionSC.on(
    'AuctionResulted',
    async (nftAddress, tokenID, winner, winningBid) => {
      winningBid = parseToFTM(winningBid)
      try {
        nftAddress = toLowerCase(nftAddress)
        winner = toLowerCase(winner)
        // update the last sale price
        let token = await ERC721TOKEN.findOne({
          contractAddress: nftAddress,
          tokenID: tokenID,
        })
        if (token) {
          token.price = winningBid
          token.lastSalePrice = winningBid
          token.soldAt = new Date()
          await token.save()
          try {
            if (token) {
              let from = toLowerCase(token.owner)
              let history = new TradeHistory()
              history.collectionAddress = nftAddress
              history.tokenID = tokenID
              history.from = from
              history.to = winner
              history.price = winningBid
              history.isAuction = true
              await history.save()
            }
          } catch (error) {}
        }

        try {
          await Auction.deleteMany({
            minter: nftAddress,
            tokenID: tokenID,
          })
        } catch (error) {}
        try {
          await Bid.deleteMany({
            minter: nftAddress,
            tokenID: tokenID,
          })
        } catch (error) {}

        try {
          let account = await Account.findOne({ address: winner })
          if (account) {
            await MailService.sendEmail(
              account.email,
              'You won the NFT from Auction',
              `Dear ${account.alias}, you are getting this email because you won the nft from auction`,
            )
          }
        } catch (error) {}
      } catch (error) {}
    },
  )
  auctionSC.on('AuctionCancelled', async (nftAddress, tokenID) => {
    nftAddress = toLowerCase(nftAddress)
    tokenID = parseInt(tokenID)
    try {
      let tk = await ERC721TOKEN.findOne({
        contractAddress: nftAddress,
        tokenID: tokenID,
      })
      if (tk) {
        tk.saleEndsAt = new Date(1970, 1, 1)
      }
    } catch (error) {}
    try {
      await Auction.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      console.log(nftAddress, tokenID)
      let bid = await Bid.findOne({
        minter: nftAddress,
        tokenID: tokenID,
      })
      let bidder = toLowerCase(bid.bidder)
      await Bid.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })

      if (!bid) return

      let account = await Account.findOne({ address: bidder })
      if (account) {
        try {
          await MailService.sendEmail(
            account.email,
            'Auction called off',
            `Dear ${account.alias}, you are getting this email because the nft item you bided has lost from Auction`,
          )
        } catch (error) {}
        try {
          await Auction.deleteMany({ minter: nftAddress, tokenID: tokenID })
        } catch (error) {}
      }
    } catch (error) {}
  })
}

module.exports = trackAuction
