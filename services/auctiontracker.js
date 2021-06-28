require('dotenv').config()
const ethers = require('ethers')
const axios = require('axios')

const Auction_SC = require('../constants/auction_sc_abi')
const rpcapi = process.env.MAINNET_RPC
const provider = new ethers.providers.JsonRpcProvider(rpcapi, 250)
const apiEndPoint = 'https://api0.artion.io/auction/'

const loadAuctionContract = () => {
  let abi = Auction_SC.abi
  let address = Auction_SC.address

  let contract = new ethers.Contract(address, abi, provider)
  return contract
}

const auctionSC = loadAuctionContract()

const callAPI = (endpoint, data) => {
  axios({
    method: 'post',
    url: apiEndPoint + endpoint,
    data,
  })
}

const trackAuction = () => {
  console.log('auction tracker has been started')

  auctionSC.on('AuctionCreated', (nftAddress, tokenID) => {
    callAPI('auctionCreated', { nftAddress, tokenID })
  })

  auctionSC.on('UpdateAuctionStartTime', (nftAddress, tokenID, startTime) => {
    callAPI('updateAuctionStartTime', { nftAddress, tokenID, startTime })
  })

  auctionSC.on('UpdateAuctionEndTime', (nftAddress, tokenID, endTime) => {
    callAPI('updateAuctionEndTime', { nftAddress, tokenID, endTime })
  })
  auctionSC.on(
    'UpdateAuctionReservePrice',
    (nftAddress, tokenID, reservePrice) => {
      callAPI('updateAuctionReservePrice', {
        nftAddress,
        tokenID,
        reservePrice,
      })
    },
  )

  auctionSC.on('BidPlaced', (nftAddress, tokenID, bidder, bid) => {
    callAPI('bidPlaced', { nftAddress, tokenID, bidder, bid })
  })

  auctionSC.on('BidWithdrawn', (nftAddress, tokenID, bidder, bid) => {
    callAPI('bidWithdrawn', { nftAddress, tokenID, bidder, bid })
  })

  auctionSC.on('AuctionResulted', (nftAddress, tokenID, winner, winningBid) => {
    callAPI('auctionResulted', { nftAddress, tokenID, winner, winningBid })
  })
  auctionSC.on('AuctionCancelled', (nftAddress, tokenID) => {
    callAPI('auctionCancelled', { nftAddress, tokenID })
  })
}

module.exports = trackAuction
