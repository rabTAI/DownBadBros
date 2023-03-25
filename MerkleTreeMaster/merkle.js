const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
let Whitelist = require('./Accounts.json')

const leafNodes = Whitelist.map(addr => keccak256(addr));
const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
const rootHash = merkleTree.getRoot();

// console.log('Whitelist Merkle Tree\n', merkleTree.toString());
console.log("Root Hash: ", '0x' + rootHash.toString('hex'));

// put address here to check if its on your wl or not
const claimingAddress = keccak256('0x9b5b11a1d06f5dcd221c98642d5aad7375dcca33');

const hexProof = merkleTree.getHexProof(claimingAddress);
console.log('hexproof\n', hexProof);
console.log(merkleTree.verify(hexProof, claimingAddress, rootHash));


