require('dotenv').config()
const ethers = require('ethers')

const AuctionContractInfo = require('../constants/auction_sc_abi')
let rpcapi = process.env.MAINNET_RPC

let provider = new ethers.providers.JsonRpcProvider(rpcapi, 250)

const loadContractFromAddress = () => {
  let abi = AuctionContractInfo.abi
  let address = AuctionContractInfo.address

  let contract = new ethers.Contract(address, abi, provider)
  return contract
}

const getTokenInfo = async (address, tkID) => {
  let minter = contractutils.loadContractFromAddress(address)
  if (!minter) return null
  let uri = await minter.tokenURI(tkID)
  return uri
}

const contractutils = {
  loadContractFromAddress,
  getTokenInfo,
}

module.exports = contractutils
