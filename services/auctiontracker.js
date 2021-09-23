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
    if (err && err.response && err.response.status === 400) {
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
  let lastBlockProcessed = startFromBlock;

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
      // // Auction lifecycle events
      if (event.event === "AuctionCreated") {
        console.log(`[AuctionCreated] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleCreateAuction(event);
      }
      if (event.event === "AuctionCancelled") {
        console.log(`[AuctionCancelled] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionCancelled(event);
      }
      if (event.event === "AuctionResulted") {
        console.log(`[AuctionResulted] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionResulted(event)
      }
      // Auction update events
      if (event.event === "UpdateAuctionStartTime") {
        console.log(`[UpdateAuctionStartTime] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionUpdateStartTime(event);
      }
      if (event.event === "updateAuctionEndTime") {
        console.log(`[updateAuctionEndTime] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionUpdateEndTime(event)
      }
      if (event.event === "UpdateAuctionReservePrice") {
        console.log(`[UpdateAuctionReservePrice] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionUpdateReservePrice(event)
      }
      // Bid events
      if (event.event === "BidPlaced") {
        console.log(`[BidPlaced] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionBidPlaced(event)
      }
      if (event.event === "BidWithdrawn") {
        console.log(`[BidWithdrawn] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionBidWithdrawn(event)
      }
      if (event.event === "BidRefunded") {
        console.log(`[BidRefunded] tx: ${event.transactionHash}, block: ${event.blockNumber}`)
        await handleAuctionBidRefunded(event)
      }

      lastBlockProcessed = event.blockNumber + 1;
    }
  }

  try {
    const pastEvents = await auctionSC.queryFilter('*', startFromBlock, currentBlock);
    const batches = pastEvents.reduce((batchArray, item, index) => {
      const chunkIndex = Math.floor(index / 10)

      if(!batchArray[chunkIndex]) {
        batchArray[chunkIndex] = [] // start a new chunk
      }

      batchArray[chunkIndex].push(item)

      return batchArray
    }, [])

    batches.length && console.log(`Event batches to run ${batches.length}`);
    let runBatch = 0;
    await new Promise((resolve) => {
      let interval = setInterval(async () => {
        if (runBatch >= batches.length) {
          clearInterval(interval);
          return resolve()
        }

        await handleEvents(batches[runBatch]);
        await TrackerState.updateOne({contractAddress: process.env.CONTRACTADDRESS}, {lastBlockProcessed});
        console.log(`[PastEvents] Proccesed batch ${runBatch + 1} of ${batches.length}`);
        console.log(`[PastEvents] LastBlockProcessed: ${lastBlockProcessed}`);

        runBatch += 1;
      }, 1000);
    });
  } catch (err) {
    console.error(err.message);
  }
}

module.exports = processAuctionEvents
