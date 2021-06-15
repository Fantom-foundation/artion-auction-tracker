require('dotenv').config()
const ethers = require('ethers')
const mongoose = require('mongoose')
const Auction = mongoose.model('Auction')
const Account = mongoose.model('Account')
const Bid = mongoose.model('Bid')
const NFTITEM = mongoose.model('NFTITEM')
const Collection = mongoose.model('Collection')
const TradeHistory = mongoose.model('TradeHistory')

const Auction_SC = require('../constants/auction_sc_abi')
let rpcapi = process.env.MAINNET_RPC

let provider = new ethers.providers.JsonRpcProvider(rpcapi, 250)

const loadAuctionContract = () => {
  let abi = Auction_SC.abi
  let address = Auction_SC.address

  let contract = new ethers.Contract(address, abi, provider)
  return contract
}

const auctionSC = loadAuctionContract()

const sendEmail = require('../utils/mailer')

const toLowerCase = (val) => {
  if (val) return val.toLowerCase()
  else return val
}

const parseToFTM = (inWei) => {
  return parseFloat(inWei.toString()) / 10 ** 18
}

const getCollectionName = async (address) => {
  try {
    let collection = await Collection.findOne({
      erc721Address: toLowerCase(address),
    })
    if (collection) return collection.collectionName
    else return address
  } catch (error) {
    return address
  }
}

const get721ItemName = async (nft, tokenID) => {
  try {
    let token = await NFTITEM.findOne({
      contractAddress: toLowerCase(nft),
      tokenID: tokenID,
    })
    if (token) return token.name
    else return tokenID
  } catch (error) {
    return tokenID
  }
}

const getUserAlias = async (walletAddress) => {
  try {
    let account = await Account.findOne({ address: walletAddress })
    if (account) return account.alias
    else return walletAddress
  } catch (error) {
    return walletAddress
  }
}

const getAuctionEndTime = async (sc, nftAddress, tokenID) => {
  try {
    let auction = await sc.getAuction(nftAddress, tokenID)
    if (auction) {
      return new Date(parseInt(auction._endTime.toString()) * 1000)
    } else return null
  } catch (error) {
    return null
  }
}

const trackAuction = () => {
  console.log('auction tracker has been started')

  auctionSC.on('AuctionCreated', async (nftAddress, tokenID) => {
    nftAddress = toLowerCase(nftAddress)
    tokenID = parseInt(tokenID)
    try {
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
    // update sale ends time
    try {
      let token = await NFTITEM.findOne({
        contractAddress: nftAddress,
        tokenID: tokenID,
      })
      if (token) {
        let endTime = await getAuctionEndTime(auctionSC, nftAddress, tokenID)
        token.saleEndsAt = endTime
        await token.save()
      }
    } catch (error) {}
  })

  auctionSC.on(
    'UpdateAuctionStartTime',
    async (nftAddress, tokenID, startTime) => {
      nftAddress = toLowerCase(nftAddress)
      tokenID = parseInt(tokenID)
      // update saleEndsAt for 721 tk
      try {
        let tk = await NFTITEM.findOne({
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
        })
        if (auction) {
          auction.startTime = new Date(parseInt(startTime) * 1000)
          let endTime = await getAuctionEndTime(auctionSC, nftAddress, tokenID)
          auction.endTime = endTime
          await auction.save()
        }
      } catch (error) {}
    },
  )

  auctionSC.on(
    'UpdateAuctionReservePrice',
    async (nftAddress, tokenID, reservePrice) => {
      nftAddress = toLowerCase(nftAddress)
      reservePrice = parseToFTM(reservePrice)
      let bid = await Bid.findOne({
        minter: nftAddress,
        tokenID: tokenID,
      })
      if (bid) {
        let bidder = toLowerCase(bid.bidder)
        let account = await Account.findOne({ address: bidder })

        if (account) {
          let to = account.email
          let alias = account.alias
          let collectionName = await getCollectionName(nftAddress)
          let tokenName = await get721ItemName(nftAddress, tokenID)
          let data = {
            type: 'auction',
            to: to,
            event: 'UpdateAuctionReservePrice',
            subject: 'NFT Auction Price Updated',
            alias: alias,
            collectionName: collectionName,
            tokenName: tokenName,
            tokenID: tokenID,
            nftAddress: nftAddress,
            newPrice: reservePrice,
          }
          sendEmail(data)
        }
      }
    },
  )

  auctionSC.on('BidPlaced', async (nftAddress, tokenID, bidder, bid) => {
    try {
      nftAddress = toLowerCase(nftAddress)
      bidder = toLowerCase(bidder)
      bid = parseToFTM(bid)
      let tk = await NFTITEM.findOne({
        tokenID: tokenID,
        contractAddress: nftAddress,
      })

      // there is only 1 bidder, the top bidder will be the only one who is selected
      if (tk) {
        let address = tk.owner
        let account = await Account.findOne({ address: address })
        if (account) {
          let to = account.email
          let alias = account.alias
          let collectionName = await getCollectionName(nftAddress)
          let tokenName = await get721ItemName(nftAddress, tokenID)
          let bidderAlias = await getUserAlias(bidder)
          let data = {
            type: 'auction',
            to: to,
            event: 'BidPlaced',
            subject: 'You got a bid for your item!',
            alias: alias,
            bidderAlias: bidderAlias,
            collectionName: collectionName,
            tokenName: tokenName,
            tokenID: tokenID,
            nftAddress: nftAddress,
            bid: bid,
          }
          sendEmail(data)
        }
      }
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
    } catch (error) {}
  })

  auctionSC.on('BidWithdrawn', async (nftAddress, tokenID, bidder, bid) => {
    bid = parseToFTM(bid)

    // send mail
    let tk = await NFTITEM.findOne({
      tokenID: tokenID,
      contractAddress: nftAddress,
    })
    if (tk) {
      let address = tk.owner
      let account = await Account.findOne({ address: address })
      if (account) {
        let to = account.email
        let alias = account.alias
        let collectionName = await getCollectionName(nftAddress)
        let tokenName = await get721ItemName(nftAddress, tokenID)
        let bidderAlias = await getUserAlias(bidder)
        let data = {
          type: 'auction',
          to: to,
          event: 'BidWithdrawn',
          subject: 'You got a bid withdrawn for your item!',
          alias: alias,
          bidderAlias: bidderAlias,
          collectionName: collectionName,
          tokenName: tokenName,
          tokenID: tokenID,
          nftAddress: nftAddress,
          bid: bid,
        }
        sendEmail(data)
      }
    } else {
    }
    // remove bids
    try {
      nftAddress = toLowerCase(nftAddress)
      bidder = toLowerCase(bidder)
      await Bid.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
    } catch (error) {}
  })

  auctionSC.on(
    'AuctionResulted',
    async (nftAddress, tokenID, winner, winningBid) => {
      winningBid = parseToFTM(winningBid)
      nftAddress = toLowerCase(nftAddress)
      winner = toLowerCase(winner)
      try {
        // send mail
        try {
          let account = await Account.findOne({ address: winner })
          if (account) {
            let to = account.email
            let alias = account.alias
            let collectionName = await getCollectionName(nftAddress)
            let tokenName = await get721ItemName(nftAddress, tokenID)
            let data = {
              type: 'auction',
              to: to,
              event: 'AuctionResulted',
              subject: 'You won the NFT Item!',
              alias: alias,
              collectionName: collectionName,
              tokenName: tokenName,
              tokenID: tokenID,
              nftAddress: nftAddress,
              winningBid: winningBid,
            }
            sendEmail(data)
          }
        } catch (error) {}
        // update the last sale price
        let token = await NFTITEM.findOne({
          contractAddress: nftAddress,
          tokenID: tokenID,
        })
        if (token) {
          token.price = winningBid
          token.lastSalePrice = winningBid
          token.soldAt = new Date()
          // update sale ends at as well
          token.saleEndsAt = null
          await token.save()
          try {
            let from = toLowerCase(token.owner)
            let history = new TradeHistory()
            history.collectionAddress = nftAddress
            history.tokenID = tokenID
            history.from = from
            history.to = winner
            history.price = winningBid
            history.isAuction = true
            await history.save()
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
      } catch (error) {}
    },
  )
  auctionSC.on('AuctionCancelled', async (nftAddress, tokenID) => {
    nftAddress = toLowerCase(nftAddress)
    tokenID = parseInt(tokenID)
    // first send email
    let bid = await Bid.findOne({
      minter: nftAddress,
      tokenID: tokenID,
    })
    if (bid) {
      let bidder = toLowerCase(bid.bidder)
      let account = await Account.findOne({ address: bidder })
      if (account) {
        let to = account.email
        let alias = account.alias
        let collectionName = await getCollectionName(nftAddress)
        let tokenName = await get721ItemName(nftAddress, tokenID)
        let data = {
          type: 'auction',
          to: to,
          event: 'AuctionCancelled',
          subject: 'Auction cancelled!',
          alias: alias,
          collectionName: collectionName,
          tokenName: tokenName,
          tokenID: tokenID,
          nftAddress: nftAddress,
        }
        sendEmail(data)
      }
    }

    // update
    try {
      let tk = await NFTITEM.findOne({
        contractAddress: nftAddress,
        tokenID: tokenID,
      })
      if (tk) {
        tk.saleEndsAt = new null()
        await tk.save()
      }
    } catch (error) {}
    try {
      await Auction.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
      await Bid.deleteMany({
        minter: nftAddress,
        tokenID: tokenID,
      })
    } catch (error) {}
  })
}

module.exports = trackAuction
