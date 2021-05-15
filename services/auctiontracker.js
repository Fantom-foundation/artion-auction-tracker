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

const trackAuction = () => {
  console.log('auction tracker has been started')

  auctionSC.on('AuctionCreated', async (nftAddress, tokenID) => {
    try {
      nftAddress = toLowerCase(nftAddress)
      console.log('auction created')
      console.log(nftAddress, tokenID)
      await Auction.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      let auction = new Auction()
      auction.minter = toLowerCase(nftAddress)
      auction.tokenID = tokenID
      auction.bidder = 0
      await auction.save()
      console.log('new auction saved')
    } catch (error) {}
  })

  auctionSC.on(
    'UpdateAuctionStartTime',
    async (nftAddress, tokenID, startTime) => {
      try {
        nftAddress = toLowerCase(nftAddress)
        console.log('update auction start time')
        console.log(nftAddress, tokenID, startTime)
        let auction = await Auction.findOne({
          minter: toLowerCase(nftAddress),
          tokenID: tokenID,
          endTime: { $gt: Date.now() },
        })
        console.log('auction is ')
        console.log(auction)
        if (auction) {
          auction.startTime = new Date(startTime)
          let _auction = await auction.save()
          console.log('old auction is ')
          console.log(_auction)
        }
      } catch (error) {}
    },
  )

  auctionSC.on(
    'UpdateAuctionReservePrice',
    async (nftAddress, tokenID, reservePrice) => {
      try {
        nftAddress = toLowerCase(nftAddress)
        console.log('auction update price')
        console.log(nftAddress, tokenID, reservePrice)
        // update the price
        let token = await ERC721TOKEN.findOne({
          contractAddress: nftAddress,
          tokenID: tokenID,
        })
        if (token) {
          token.price = parseFloat(reservePrice.toString()) / 10 ** 18
          await token.save()
        }
        let bid = await Bid.findOne({
          minter: nftAddress,
          tokenID: tokenID,
        })
        if (bid) {
          console.log('bid')
          console.log(bid)
          let bidder = toLowerCase(bid.bidder)
          console.log('bidder')
          console.log(bidder)
          let account = await Account.findOne({ address: bidder })
          console.log('account')
          console.log(account)
          if (account) {
            try {
              await MailService.sendEmail(
                account.email,
                'NFT Auction Price Updated',
                `Dear ${account.alias}, you are getting this email because the nft you has bidded has updated in it's price to ${reservePrice}`,
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
      console.log('bid placed')
      console.log(nftAddress, tokenID, bidder, bid)
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
      console.log('new bid saved')
      let tk = await ERC721TOKEN.findOne({
        tokenID: tokenID,
        contractAddress: nftAddress,
      })
      console.log('tk')
      console.log(tk)
      if (tk) {
        let address = tk.owner
        let account = await Account.findOne({ address: address })
        if (account) {
          try {
            await MailService.sendEmail(
              account.email,
              'You got a bid for your NFT',
              `Dear ${account.alias}, you are getting this email because your nft item got a bid from ${bidder} with the price of ${bid}`,
            )
          } catch (error) {
            console.log('bid placed')
            console.log(error)
          }
        }
      }
    } catch (error) {}
  })

  auctionSC.on('BidWithdrawn', async (nftAddress, tokenID, bidder, bid) => {
    try {
      nftAddress = toLowerCase(nftAddress)
      bidder = toLowerCase(bidder)
      console.log('bid withdrawn')
      console.log(nftAddress, tokenID, bidder, bid)
      await Bid.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      let tk = await ERC721TOKEN.findOne({
        tokenID: tokenID,
        contractAddress: nftAddress,
      })
      console.log(tk)
      if (tk) {
        let address = tk.owner
        console.log(address)
        let account = await Account.findOne({ address: address })
        console.log(account)
        if (account) {
          try {
            await MailService.sendEmail(
              account.email,
              'You got a bid withdrawn for your NFT',
              `Dear ${account.alias}, you are getting this email because your nft item has lost a bid from ${bidder} with the price of ${bid}`,
            )
          } catch (error) {
            console.log('bid withdraw')
            console.log(error)
          }
        }
      } else {
        console.log('no tk')
      }
    } catch (error) {}
  })

  auctionSC.on(
    'AuctionResulted',
    async (nftAddress, tokenID, winner, winningBid) => {
      try {
        nftAddress = toLowerCase(nftAddress)
        winner = toLowerCase(winner)
        console.log('auction resulted')
        console.log(nftAddress, tokenID, winner, winningBid)
        // update the last sale price
        let token = await ERC721TOKEN.findOne({
          contractAddress: nftAddress,
          tokenID: tokenID,
        })
        if (token) {
          token.price
          token.lastSalePrice = parseFloat(winningBid.toString()) / 10 ** 18
          token.saleEndsAt = Date.now()
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
              console.log('history saved')
              console.log('tk updated')
            }
          } catch (error) {
            console.log('auction resulted')
            console.log(error)
          }
        }

        try {
          await Auction.deleteMany({
            minter: nftAddress,
            tokenID: tokenID,
          })
        } catch (error) {
          console.log('auction resulted')
          console.log('remove from db')
          console.log(error)
        }

        try {
          let account = await Account.findOne({ address: winner })
          if (account) {
            await MailService.sendEmail(
              account.email,
              'You won the NFT from Auction',
              `Dear ${account.alias}, you are getting this email because you won the nft from auction`,
            )
          }
        } catch (error) {
          console.log('auction resulted')
          console.log('sending email')
          console.log(error)
        }
      } catch (error) {}
    },
  )
  auctionSC.on('AuctionCancelled', async (nftAddress, tokenID) => {
    try {
      nftAddress = toLowerCase(nftAddress)
      console.log('auction cancelled')
      await Auction.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      console.log(nftAddress, tokenID)
      let bid = await Bid.findOne({
        minter: nftAddress,
        tokenID: tokenID,
      })
      await Bid.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      console.log('bid is ')
      console.log(bid)
      if (!bid) return
      let bidder = toLowerCase(bid.bidder)
      console.log(`bidder is ${bidder}`)
      let account = await Account.findOne({ address: bidder })
      console.log('account is ')
      console.log(account)
      if (account) {
        console.log(`email is ${account.email}`)
        try {
          await MailService.sendEmail(
            account.email,
            'You got a bid for your NFT',
            `Dear ${account.alias}, you are getting this email because the nft item you bided has lost from Auction`,
          )
        } catch (error) {
          console.log('auction cancelled')
          console.log(error)
        }
        try {
          await Auction.deleteMany({ minter: nftAddress, tokenID: tokenID })
        } catch (error) {
          console.log('auction cancelled')
          console.log('remove from db')
          console.log(error)
        }
      }
    } catch (error) {}
  })
}

module.exports = trackAuction
