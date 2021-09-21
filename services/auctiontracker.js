require('dotenv').config()
const ethers = require('ethers')
const axios = require('axios')

const mongoose = require('mongoose')
const TrackerState = mongoose.model('TRACKER_STATE');
const EVENT_DEAD_LETTER_QUEUE = require('../models/event_deadletter_queue');
const EventDeadLetterQueue = mongoose.model('EVENT_DEAD_LETTER_QUEUE', EVENT_DEAD_LETTER_QUEUE);

const Auction_SC = require('../constants/auction_sc_abi')
const rpcapi = process.env.NETWORK_RPC
const chainID = parseInt(process.env.NETWORK_CHAINID)
const provider = new ethers.providers.JsonRpcProvider(rpcapi, chainID)
const apiEndPoint = process.env.API_ENDPOINT

const loadAuctionContract = () => {
  let abi = Auction_SC.abi
  let address = process.env.CONTRACTADDRESS

  return new ethers.Contract(address, abi, provider)
}

const auctionSC = loadAuctionContract()


const callAPI = async (endpoint, data) => {
  try {
    await axios({
      method: 'post',
      url: apiEndPoint + endpoint,
      data,
    })
  } catch(err) {
    // If bad request save to dead letter queue
    if (err.response.status === 400) {
      console.warn(`[bad-request] add event to dead-letter-queue, txHash: ${data.transactionHash}`);
      await EventDeadLetterQueue.create({contract: process.env.CONTRACTADDRESS, event: data})
      return;
    }
    // If other reasons (server unreachable for example) throw and block;
    throw err;
  }
}

const processAuctionEvents = async (startFromBlock) => {
  const currentBlock = await provider.getBlockNumber();
  let lastBlockProcessed = currentBlock;

  console.info(`Tracking block: ${startFromBlock} - ${currentBlock}`)

  const handleCreateAuction = async (event) => {
    return callAPI('auctionCreated', event)
  }
  const handleAuctionCancelled = async (event) => {
    return callAPI('auctionCancelled', event)
  }
  const handleAuctionResulted = async (event) => {
    return callAPI('auctionResulted', event)
  }

  const handleAuctionUpdateStartTime = async (event) => {
    return callAPI('updateAuctionStartTime', event)
  }
  const handleAuctionUpdateEndTime = async (event) => {
    return callAPI('updateAuctionEndTime', event)
  }
  const handleAuctionUpdateReservePrice = async (event) => {
    return callAPI('updateAuctionReservePrice', event)
  }

  const handleAuctionBidPlaced = async (event) => {
    return callAPI('bidPlaced', event)
  }
  const handleAuctionBidWithdrawn = async (event) => {
    return callAPI('bidWithdrawn', event)
  }
  const handleAuctionBidRefunded = async (event) => {
    return callAPI('bidRefunded', event)
  }

  async function handleEvents(events) {

    for (const event of events) {
      // Auction lifecycle events
      if (event.event === "AuctionCreated") {
        await handleCreateAuction(event);
        console.log("CREATE")
      }
      if (event.event === "AuctionCancelled") {
        await handleAuctionCancelled(event);
        console.log("CANCEL")
      }
      if (event.event === "AuctionResulted") {
        await handleAuctionResulted(event)
        console.log("RESULT")
      }
      // Auction update events
      if (event.event === "UpdateAuctionStartTime") {
        await handleAuctionUpdateStartTime(event);
        console.log("STARTTIME");
      }
      if (event.event === "updateAuctionEndTime") {
        await handleAuctionUpdateEndTime(event)
        console.log("ENDTIME")
      }
      if (event.event === "UpdateAuctionReservePrice") {
        await handleAuctionUpdateReservePrice(event)
        console.log("RESERVE!")
      }
      // Bid events
      if (event.event === "BidPlaced") {
        await handleAuctionBidPlaced(event)
        console.log("BID PLACED!!!!!", event)
      }
      if (event.event === "BidWithdrawn") {
        await handleAuctionBidWithdrawn(event)
        console.log("BID WITHDRAWN!!", event)
      }
      if (event.event === "BidRefunded") {
        await handleAuctionBidRefunded(event)
        console.log("BID REFUNDED")
      }

      lastBlockProcessed = event.blockNumber + 1;
    }
  }

  try {
    const pastEvents = await auctionSC.queryFilter('*', startFromBlock, currentBlock);
    await handleEvents(pastEvents);

    if (!pastEvents.length) {
      lastBlockProcessed = currentBlock;
    }

    return TrackerState.updateOne({contractAddress: process.env.CONTRACTADDRESS}, {lastBlockProcessed})
  } catch (err) {
    console.error(err.message);
  }
}

module.exports = processAuctionEvents
