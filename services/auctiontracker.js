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

const callAPI = async (endpoint, data) => {
  await axios({
    method: 'post',
    url: apiEndPoint + endpoint,
    data,
  })
}

const trackAuction = () => {
  console.log('auction tracker has been started')

  auctionSC.on('AuctionCreated', async (nftAddress, tokenID) => {
    await callAPI('auctionCreated', { nftAddress, tokenID })
  })

  auctionSC.on(
    'UpdateAuctionStartTime',
    async (nftAddress, tokenID, startTime) => {
      await callAPI('updateAuctionStartTime', {
        nftAddress,
        tokenID,
        startTime,
      })
    },
  )

  auctionSC.on('UpdateAuctionEndTime', async (nftAddress, tokenID, endTime) => {
    await callAPI('updateAuctionEndTime', { nftAddress, tokenID, endTime })
  })
  auctionSC.on(
    'UpdateAuctionReservePrice',
    async (nftAddress, tokenID, reservePrice) => {
      await callAPI('updateAuctionReservePrice', {
        nftAddress,
        tokenID,
        reservePrice,
      })
    },
  )

  auctionSC.on('BidPlaced', async (nftAddress, tokenID, bidder, bid) => {
    await callAPI('bidPlaced', { nftAddress, tokenID, bidder, bid })
  })

  auctionSC.on('BidWithdrawn', async (nftAddress, tokenID, bidder, bid) => {
    await callAPI('bidWithdrawn', { nftAddress, tokenID, bidder, bid })
  })

  auctionSC.on(
    'AuctionResulted',
    async (nftAddress, tokenID, winner, winningBid) => {
      await callAPI('auctionResulted', {
        nftAddress,
        tokenID,
        winner,
        winningBid,
      })
    },
  )
  auctionSC.on('AuctionCancelled', async (nftAddress, tokenID) => {
    await callAPI('auctionCancelled', { nftAddress, tokenID })
  })
}

module.exports = trackAuction
