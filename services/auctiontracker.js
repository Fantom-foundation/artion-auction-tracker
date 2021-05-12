const mongoose = require('mongoose')
const Auction = mongoose.model('Auction')
const Account = mongoose.model('Account')
const Bid = mongoose.model('Bid')
const ERC721TOKEN = mongoose.model('ERC721TOKEN')
const TradeHistory = mongoose.model('TradeHistory')

const contractutils = require('../utils/contracts.utils')
const auctionSC = contractutils.loadContractFromAddress()

const MailService = require('../utils/mailer')

const trackAuction = () => {
  console.log('auction tracker has been started')

  auctionSC.on('AuctionCreated', async (nftAddress, tokenID) => {
    console.log('auction created')
    console.log(nftAddress, tokenID)
    await Auction.deleteMany({
      minter: nftAddress.toLowerCase(),
      tokenID: tokenID,
    })
    let auction = new Auction()
    auction.minter = nftAddress.toLowerCase()
    auction.tokenID = tokenID
    await auction.save()
    console.log('new auction saved')
  })

  auctionSC.on(
    'UpdateAuctionStartTime',
    async (nftAddress, tokenID, startTime) => {
      console.log('update auction start time')
      console.log(nftAddress, tokenID, startTime)
      let auction = await Auction.findOne({
        minter: nftAddress.toLowerCase(),
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
    },
  )

  auctionSC.on(
    'UpdateAuctionReservePrice',
    async (nftAddress, tokenID, reservePrice) => {
      console.log('auction update price')
      console.log(nftAddress, tokenID, reservePrice)
      let bid = await auctionSC.getHighestBidder(
        nftAddress.toLowerCase(),
        tokenID,
      )
      console.log('bid')
      console.log(bid)
      let bidder = bid[0]
      let account = Account.findOne({ address: bidder.toLowerCase() })
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
    },
  )

  auctionSC.on('BidPlaced', async (nftAddress, tokenID, bidder, bid) => {
    console.log('bid placed')
    console.log(nftAddress, tokenID, bidder, bid)
    let newBid = new Bid()
    newBid.minter = nftAddress.toLowerCase()
    newBid.tokenID = tokenID
    newBid.bidder = bidder.toLowerCase()
    newBid.bid = bid
    await newBid.save()
    console.log('new bid saved')
    let tk = await ERC721TOKEN.findOne({
      tokenID: tokenID,
      contractAddress: nftAddress.toLowerCase(),
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
  })

  auctionSC.on('BidWithdrawn', async (nftAddress, tokenID, bidder, bid) => {
    console.log('bid withdrawn')
    console.log(nftAddress, tokenID, bidder, bid)
    let oldBid = await Bid.findOne({
      minter: nftAddress.toLowerCase(),
      tokenID: tokenID,
      bidder: bidder.toLowerCase(),
      bid: bid,
    })
    console.log('old bid')
    console.log(oldBid)
    if (oldBid) {
      await oldBid.remove()
    }
    let tk = await ERC721TOKEN.findOne({
      tokenID: tokenID,
      contractAddress: nftAddress.toLowerCase(),
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
            'You got a bid for your NFT',
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
  })

  auctionSC.on(
    'AuctionResulted',
    async (nftAddress, tokenID, winner, winningBid) => {
      console.log('auction resulted')
      console.log(nftAddress, tokenID, winner, winningBid)
      try {
        let tk = await ERC721TOKEN.findOne({
          contractAddress: nftAddress.toLowerCase(),
          tokenID: tokenID,
        })
        console.log('tk')
        console.log(tk)
        if (tk) {
          let from = tk.owner
          let history = new TradeHistory()
          history.collectionAddress = nftAddress.toLowerCase()
          history.tokenID = tokenID
          history.from = from.toLowerCase()
          history.to = winner.toLowerCase()
          history.price = winningBid
          history.isAuction = true
          await history.save()
          console.log('history saved')
          tk.owner = winner.toLowerCase()
          await tk.save()
          console.log('tk updated')
        }
      } catch (error) {
        console.log('auction resulted')
        console.log(error)
      }

      try {
        await Auction.deleteMany({ minter: nftAddress, tokenID: tokenID })
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
    },
  )
  auctionSC.on('AuctionCancelled', async (nftAddress, tokenID) => {
    console.log('auction cancelled')
    console.log(nftAddress, tokenID)
    let bidder = await auctionSC.getHighestBidder(
      nftAddress.toLowerCase(),
      tokenID,
    )
    console.log('bidder')
    let address = bidder[0]
    console.log('bidder 0')
    console.log(bidder)
    console.log('address')
    console.log(address)
    let account = await Account.findOne({ address: address })
    if (account) {
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
  })
}

module.exports = trackAuction
