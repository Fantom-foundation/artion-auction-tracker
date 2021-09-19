const mongoose = require('mongoose')

const AUCTIONTRACKERSTATE = new mongoose.Schema({
  contractAddress: { type: String, required: true},
  lastBlockProcessed: { type: Number, required: true },
})
AUCTIONTRACKERSTATE.index({ contractAddress: 1 }, { unique: true })

module.exports = AUCTIONTRACKERSTATE;
