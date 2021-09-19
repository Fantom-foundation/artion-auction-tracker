require('dotenv').config()
const mongoose = require('mongoose');
require('./models/auctiontrackerstate');
const AUCTIONTRACKERSTATE = require('./models/auctiontrackerstate');
const AuctionTrackerState = mongoose.model('AUCTIONTRACKERSTATE', AUCTIONTRACKERSTATE);
const processAuctionEvents = require('./services/auctiontracker')

const connect = () => {
  const uri = process.env.DB_URL
  mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  const db = mongoose.connection

  db.on('error', console.error.bind(console, 'connection error:'))
  db.once('open', async () => {
    // Check last block processed;
    const result = await AuctionTrackerState.find({ contractAddress: process.env.CONTRACTADDRESS });
    if (!result.length) {
      await AuctionTrackerState.create({ contractAddress: process.env.CONTRACTADDRESS, lastBlockProcessed: 0 });
    }

    const trackContractCallback = async () => {
        const lastBlockRecord = await AuctionTrackerState.find({ contractAddress: process.env.CONTRACTADDRESS });
        await processAuctionEvents(lastBlockRecord[0].lastBlockProcessed)
        setTimeout(() => trackContractCallback(), 1000);
    }
    await trackContractCallback();
  })
}

connect();
