require('dotenv').config()
const mongoose = require('mongoose');
require('./models/trackerstate');
const TRACKER_STATE = require('./models/tracker_state');
const TrackerState = mongoose.model('TRACKER_STATE', TRACKER_STATE);
const processAuctionEvents = require('./services/auctiontracker')

const connect = () => {
  const uri = process.env.DB_URL
  mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  const db = mongoose.connection

  db.on('error', console.error.bind(console, 'connection error:'))
  db.once('open', async () => {
    // Check last block processed;
    const result = await TrackerState.find({ contractAddress: process.env.CONTRACTADDRESS });
    if (!result.length) {
      await TrackerState.create({ contractAddress: process.env.CONTRACTADDRESS, lastBlockProcessed: 0 });
    }

    const trackContractCallback = async () => {
        const lastBlockRecord = await TrackerState.find({ contractAddress: process.env.CONTRACTADDRESS });
        await processAuctionEvents(lastBlockRecord[0].lastBlockProcessed)
        setTimeout(() => trackContractCallback(), 1000);
    }
    await trackContractCallback();
  })
}

connect();
