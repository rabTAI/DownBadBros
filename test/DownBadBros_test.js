const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getOpcodeLength } = require('hardhat/internal/hardhat-network/stack-traces/opcodes');
const helpers = require("@nomicfoundation/hardhat-network-helpers");


const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
let Whitelist = require('../MerkleTreeMaster/Accounts.json')

const BigNumber = require('bignumber.js');

const provider = new ethers.providers.JsonRpcProvider("https://rpc.ftm.tools");


describe('DownBadBros.sol', () => {
    let contractFactory;
    let contract;
    let owner;
    let addr1;
    let addr2;
    let addr3;
    let maxSupply;
    let hexProof;
    let rootHash;
    let abiERC20 = [
        "function approve(address, uint256) external returns(bool)", "function balanceOf(address) external view returns(uint256)"
    ];
    let ownerImpersonatedSigner;
    let whitelistImpersonatedSigner;

    before(async () => {
        // Instantly mine blocks
        // await hre.network.provider.send("hardhat_mine", ["0x1000"]);
        [owner] = await ethers.getSigners();
        contractFactory = await ethers.getContractFactory('DownBadBros');
        [owner, addr1, addr2, addr3] = await ethers.getSigners();
        console.log("Owner Address ", owner.address);
        console.log("Deployer Balance ", parseInt(await provider.getBalance(owner.address)));
        console.log("Address One ", addr1.address);
        console.log("Address Two ", addr2.address);
        contract = await contractFactory.deploy();
        console.log('*** Deployed To ***', contract.address);
        maxSupply = await contract.maxSupply();
        // await hre.network.provider.send("hardhat_mine", ["0x10"]);

        const leafNodes = Whitelist.map(addr => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
        rootHash = merkleTree.getRoot();

        // console.log('Whitelist Merkle Tree\n', merkleTree.toString());
        console.log("Root Hash: ", '0x' + rootHash.toString('hex'));

        // put address here to check if its on your wl or not
        const claimingAddress = keccak256("0x7749876413881F2AbF4a196A01bF5C0E49958BAE");
        hexProof = merkleTree.getHexProof(claimingAddress);
        console.log('hexproof\n', hexProof);
        console.log("Address is whitelisted ", merkleTree.verify(hexProof, claimingAddress, rootHash));
        await helpers.impersonateAccount("0x36D94F96ff51d344a5efCAD2309411F97dC54827");
        ownerImpersonatedSigner = await ethers.getSigner("0x36D94F96ff51d344a5efCAD2309411F97dC54827");

        //White list user
        await helpers.impersonateAccount("0x7749876413881F2AbF4a196A01bF5C0E49958BAE");
        whitelistImpersonatedSigner = await ethers.getSigner("0x7749876413881F2AbF4a196A01bF5C0E49958BAE");
    });

    describe('Deployment', function () {
        it('Should set the right owner', async function () {
            console.log('Deployer address ', owner.address);
            await expect(await contract.owner()).to.equal("0x36D94F96ff51d344a5efCAD2309411F97dC54827");
        });
    });

    describe('Correct setup', () => {
        it("should be named 'DownBadBros", async () => {
            const name = await contract.name();
            await expect(name).to.equal('Down Bad Bros');
        });
    });

    describe('IERC165 supportsInterface', () => {
        it('IERC165', async () => {
            expect(await contract.supportsInterface('0x01ffc9a7')).to.equal(true);
        });
        it('IERC721 nft', async () => {
            expect(await contract.supportsInterface('0x80ac58cd')).to.equal(true);
        });
        it('IERC721Metadata', async () => {
            expect(await contract.supportsInterface('0x5b5e139f')).to.equal(true);
        });
        // it('IERC721Enumerable totalSupply, tokenOfOwnerByIndex', async () => {
        //     expect(await contract.supportsInterface('0x780e9d63')).to.equal(true);
        // });
        // it('IERC2981 royalties', async () => {
        //     expect(await contract.supportsInterface('0x2a55205a')).to.equal(true);
    });

    describe('Mint', () => {
        it(`Owner should mint 10 NFTs`, async () => {
            console.log('>>>>>>>>>>>>> Minting >>>>>>>>>>>>>>>>');
            for (i = 1; i <= 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                let newNFT = await contract.connect(ownerImpersonatedSigner).mint(hexProof, 1);
                let newTokenId = parseInt(await getTokenId(newNFT));
                console.log('NFT minted: ', newTokenId);
            }
            const totalSupply = await contract.totalSupply();
            await expect(totalSupply).to.equal(10);
        });

        it(`Non-Owner Try to mint when mint is paused, reverted with "Minting is paused"`, async () => {
            await expect(contract.connect(addr1)
                .mint(hexProof, 1, { value: ethers.utils.parseEther(`50.0`) })).to.be.revertedWith("Minting is paused");
        });

        it(`Non-Owner Try to mint while not in White List, reverted with "Not in whitelist"`, async () => {
            await contract.connect(ownerImpersonatedSigner).flipMintState();
            console.log('Mint is unpaused');
            let mintingFee = await contract.mintCost();
            mintingFee = parseInt(mintingFee) / 10 ** 18;
            await expect(contract.connect(addr1)
                .mint(hexProof, 1, { value: ethers.utils.parseEther(`${mintingFee}`) })).to.be.revertedWith("Not in whitelist");
        });

        it(`Non-Owner Try to mint with lower minting fee, reverted with "Not enough FTM"`, async () => {
            let mintingFee = await contract.mintCost();
            mintingFee = parseInt(mintingFee) / 10 ** 18;
            await expect(contract.connect(whitelistImpersonatedSigner)
                .mint(hexProof, 1, { value: ethers.utils.parseEther(`${mintingFee - 1}`) })).to.be.revertedWith("Not enough FTM");
        });

        it(`Try to access a NFT that is not minted yet, reverted with "ERC721: invalid token ID"`, async () => {
            await expect(contract.connect(addr2).ownerOf(5000)).to.be.revertedWith("ERC721: invalid token ID");
        });

        it(`First Non-Owner Whitelisted user should mint 10 NFTs`, async () => {

            for (i = 1; i <= 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                let newNFT = await contract
                    .connect(whitelistImpersonatedSigner)
                    .mint(hexProof, 1, { value: ethers.utils.parseEther(`50.0`) });
                let newTokenId = parseInt(await getTokenId(newNFT));
                console.log('NFT minted: ', newTokenId);
            }
            const totalSupply = await contract.totalSupply();
            await expect(totalSupply).to.equal(20);
        });

        it(`Public Mint: Non whitelisted, Non-Owner user should mint 10 NFTs`, async () => {
            await contract.connect(ownerImpersonatedSigner).enablePublicMint();
            console.log('Public Mint is enabled');
            for (i = 1; i <= 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                let newNFT = await contract
                    .connect(addr1)
                    .mint(hexProof, 1, { value: ethers.utils.parseEther(`50.0`) });
                let newTokenId = parseInt(await getTokenId(newNFT));
                console.log('NFT minted: ', newTokenId);
            }
            const totalSupply = await contract.totalSupply();
            console.log("Total supply ", parseInt(totalSupply));
            console.log('Max supply: ', maxSupply);
            await expect(totalSupply).to.equal(30);
        });

        it(`Public Mint: user try to mint less than 1 NFT, reverted with "Need more than 0"`, async () => {
            await expect(contract.connect(addr2)
                .mint(hexProof, 0, { value: ethers.utils.parseEther('50.0') })).to.be.revertedWith("Need more than 0");
        });

        it(`Public Mint: user try to mint 6 per tx, reverted with "Tx Limit"`, async () => {
            await expect(contract.connect(addr2)
                .mint(hexProof, 6, { value: ethers.utils.parseEther('50.0') })).to.be.revertedWith("Limit per TX");
        });

        it(`Mint with CONK: user should mint 5 NFTs`, async () => {
            const conkUserAddress = "0xb1c3ae304b23cee3318d8097310c1767fd28ac08";
            await helpers.impersonateAccount(conkUserAddress);
            const impersonatedSigner = await ethers.getSigner(conkUserAddress);
            let tokenNeeded = await contract.getTokenNeededPerFTM("CONK");
            let mintingTokenContract = tokenNeeded._mintingTokenContract;
            let tokenPerFTM = parseInt(tokenNeeded._tokenPerFTM);
            tokenPerFTM = new BigNumber(tokenPerFTM);
            tokenPerFTM = tokenPerFTM.toFixed();
            console.log("CONK needed per FTM", tokenPerFTM);
            console.log("Token contract ", mintingTokenContract);
            let tokenContract = new ethers.Contract(mintingTokenContract, abiERC20, impersonatedSigner);
            //Always approve more than needed (price fluctuate)
            let valueToApprove = tokenPerFTM * 50 * 6;
            valueToApprove = new BigNumber(valueToApprove);
            valueToApprove = valueToApprove.toFixed();
            console.log("Value to approve to mint 5 NFTs ", valueToApprove);
            await tokenContract.approve(contract.address, valueToApprove);
            console.log("Total needed amount approved")
            //Allow contract to spend token
            for (i = 1; i <= 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                let newNFT = await contract.connect(impersonatedSigner).mintWithToken(hexProof, "CONK", 1);
                // let newTokenId = parseInt(await getTokenId(newNFT));
                // console.log('NFT minted: ', newTokenId);
            }
            const totalSupply = await contract.totalSupply();
            console.log("Total supply ", parseInt(totalSupply));
            console.log('Max supply: ', maxSupply);
            await expect(totalSupply).to.equal(35);
        });

        it(`Mint with CHILL: user should mint 5 NFTs`, async () => {
            const chillUserAddress = "0x617b2bda596441ca2428c4bcb6e28ac28b9acdb0";
            await helpers.impersonateAccount(chillUserAddress);
            const impersonatedSigner = await ethers.getSigner(chillUserAddress);
            let tokenNeeded = await contract.getTokenNeededPerFTM("CHILL");
            let mintingTokenContract = tokenNeeded._mintingTokenContract;
            let tokenPerFTM = parseInt(tokenNeeded._tokenPerFTM);
            tokenPerFTM = new BigNumber(tokenPerFTM);
            tokenPerFTM = tokenPerFTM.toFixed();
            console.log("CHILL needed per FTM", tokenPerFTM);
            console.log("Token contract ", mintingTokenContract);
            let tokenContract = new ethers.Contract(mintingTokenContract, abiERC20, impersonatedSigner);
            let valueToApprove = tokenPerFTM * 50 * 6;
            valueToApprove = new BigNumber(valueToApprove);
            valueToApprove = valueToApprove.toFixed();
            console.log("Value to approve to mint 5 NFTs ", valueToApprove);
            await tokenContract.approve(contract.address, valueToApprove);
            console.log("Total needed amount approved")
            //Allow contract to spend token
            for (i = 1; i <= 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                let newNFT = await contract.connect(impersonatedSigner).mintWithToken(hexProof, "CHILL", 1);
                // let newTokenId = parseInt(await getTokenId(newNFT));
                // console.log('NFT minted: ', newTokenId);
            }
            const totalSupply = await contract.totalSupply();
            console.log("Total supply ", parseInt(totalSupply));
            console.log('Max supply: ', maxSupply);
            await expect(totalSupply).to.equal(40);
        });

        it(`Mint with GMFTM: user should mint 5 NFTs`, async () => {
            const gmUserAddress = "0x2fb340bbde32ce2696e066b0089a99fe461d7368";
            await helpers.impersonateAccount(gmUserAddress);
            const impersonatedSigner = await ethers.getSigner(gmUserAddress);
            let tokenNeeded = await contract.getTokenNeededPerFTM("GMFTM");
            let mintingTokenContract = tokenNeeded._mintingTokenContract;
            let tokenPerFTM = parseInt(tokenNeeded._tokenPerFTM);
            tokenPerFTM = new BigNumber(tokenPerFTM);
            tokenPerFTM = tokenPerFTM.toFixed();
            console.log("GMFTM needed per FTM", tokenPerFTM);
            console.log("Token contract ", mintingTokenContract);
            let tokenContract = new ethers.Contract(mintingTokenContract, abiERC20, impersonatedSigner);
            let valueToApprove = tokenPerFTM * 50 * 6;
            valueToApprove = new BigNumber(valueToApprove);
            valueToApprove = valueToApprove.toFixed();
            console.log("Value to approve to mint 5 NFTs ", valueToApprove);
            await tokenContract.approve(contract.address, valueToApprove);
            console.log("Total needed amount approved")
            //Allow contract to spend token
            for (i = 1; i <= 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                let newNFT = await contract.connect(impersonatedSigner).mintWithToken(hexProof, "GMFTM", 1);
                // let newTokenId = parseInt(await getTokenId(newNFT));
                // console.log('NFT minted: ', newTokenId);
            }
            const totalSupply = await contract.totalSupply();
            console.log("Total supply ", parseInt(totalSupply));
            console.log('Max supply: ', maxSupply);
            await expect(totalSupply).to.equal(45);
        });

        it(`Mint with Non approved Token, reverted with "Token is not allowed"`, async () => {
            const randomUserAddress = "0x2fb340bbde32ce2696e066b0089a99fe461d7368";
            await helpers.impersonateAccount(randomUserAddress);
            const impersonatedSigner = await ethers.getSigner(randomUserAddress);
            await expect(contract.connect(impersonatedSigner).mintWithToken(hexProof, "FUN", 1)).to.be.revertedWith("Token is not allowed");
        });

        it(`Owner should mint rest of the NFTs`, async () => {
            for (i = 1; i <= maxSupply - 45; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                let newNFT = await contract
                    .connect(ownerImpersonatedSigner)
                    .mint(hexProof, 1);
                let newTokenId = parseInt(await getTokenId(newNFT));
                console.log('NFT minted: ', newTokenId);
            }
            const totalSupply = await contract.totalSupply();
            console.log("Total supply ", parseInt(totalSupply));
            console.log('Max supply: ', maxSupply);
            await expect(totalSupply).to.equal(maxSupply);
        });

        it(`Try to mint after max supply, reverted with "Max Supply"`, async () => {
            await expect(contract.connect(addr1).mint(hexProof, 1)).to.be.revertedWith("Max supply");
        });

        it(`Mint is Done: try to get NFT that is not minted, reverted with "ERC721Metadata: URI query for nonexistent token"`, async () => {
            await expect(contract.tokenURI(1000)).to.be.revertedWith("ERC721Metadata: URI query for nonexistent token");
            await expect(contract.tokenURI(0)).to.be.revertedWith("ERC721Metadata: URI query for nonexistent token");
        });

        it(`Mint is Done: Get base URI`, async () => {
            const baseURI = await contract.baseURI()
            console.log("Base URI ", baseURI);
            await expect(baseURI).to.equal("ipfs://bafybeiflr4jbtqg77f2fhpvxearwau5x3dextrf6dy5i5vxnd363uncazu/");
        });

        it(`Mint is Done: Get token URI`, async () => {
            const tokenURI = await contract.tokenURI(50);
            console.log("Token URI 50: ", tokenURI)
            await expect(tokenURI).to.equal("ipfs://bafybeiflr4jbtqg77f2fhpvxearwau5x3dextrf6dy5i5vxnd363uncazu/50");
        });

        it(`Non Owner can't withdraw, reverted with "Not a contract owner"`, async () => {
            await expect(contract.connect(addr1).withdraw).to.be.revertedWith("Not a contract owner");
            await expect(contract.connect(addr1).withdrawERC20("0xb715F8DcE2F0E9b894c753711bd55eE3C04dcA4E")).to.be.revertedWith("Not a contract owner");
        });

        it(`Owner withdraws FTM"`, async () => {
            console.log("Contract Address ", contract.address);
            console.log("Balance of contract before withdraw ", parseInt(await provider.getBalance(contract.address)));
            await contract.connect(ownerImpersonatedSigner).withdraw();
            console.log("Balance of contract after withdraw ", parseInt(await provider.getBalance(contract.address)));
        });

        it(`Owner withdraws Tokens"`, async () => {
            console.log(">>>> CONK >>>>");
            let withDrawTokenContract = new ethers.Contract("0xb715F8DcE2F0E9b894c753711bd55eE3C04dcA4E", abiERC20, owner);
            let withdrawContractTokenBalance = await withDrawTokenContract.balanceOf(contract.address);
            withdrawContractTokenBalance = parseInt(withdrawContractTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawContractTokenBalance);
            withdrawContractTokenBalance = withdrawContractTokenBalance.toFixed();
            console.log("Contract CONK Balance before withdraw", withdrawContractTokenBalance);
            let withdrawOwnerTokenBalance = await withDrawTokenContract.balanceOf(ownerImpersonatedSigner.address);
            withdrawOwnerTokenBalance = parseInt(withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawOwnerTokenBalance);
            withdrawOwnerTokenBalance = withdrawOwnerTokenBalance.toFixed();
            console.log("Owner's CONK balance before withdraw ", withdrawOwnerTokenBalance);
            await contract.connect(ownerImpersonatedSigner).withdrawERC20("0xb715F8DcE2F0E9b894c753711bd55eE3C04dcA4E");
            console.log("CONK Balance Withdraw")
            withdrawOwnerTokenBalance = await withDrawTokenContract.balanceOf(ownerImpersonatedSigner.address);
            withdrawOwnerTokenBalance = parseInt(withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawOwnerTokenBalance);
            withdrawOwnerTokenBalance = withdrawOwnerTokenBalance.toFixed();
            console.log("Owner's CONK balance after withdraw ", withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = await withDrawTokenContract.balanceOf(contract.address);
            withdrawContractTokenBalance = parseInt(withdrawContractTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawContractTokenBalance);
            withdrawContractTokenBalance = withdrawContractTokenBalance.toFixed();
            console.log("Contract CONK Balance After withdraw", withdrawContractTokenBalance);

            console.log(">>>> CHILL >>>>");
            withDrawTokenContract = new ethers.Contract("0xe47d957F83F8887063150AaF7187411351643392", abiERC20, owner);
            withdrawContractTokenBalance = await withDrawTokenContract.balanceOf(contract.address);
            withdrawContractTokenBalance = parseInt(withdrawContractTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawContractTokenBalance);
            withdrawContractTokenBalance = withdrawContractTokenBalance.toFixed();
            console.log("Contract CHILL Balance before withdraw", withdrawContractTokenBalance);
            withdrawOwnerTokenBalance = await withDrawTokenContract.balanceOf(ownerImpersonatedSigner.address);
            withdrawOwnerTokenBalance = parseInt(withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawOwnerTokenBalance);
            withdrawOwnerTokenBalance = withdrawOwnerTokenBalance.toFixed();
            console.log("Owner's CHILL balance before withdraw ", withdrawOwnerTokenBalance);
            await contract.connect(ownerImpersonatedSigner).withdrawERC20("0xe47d957F83F8887063150AaF7187411351643392");
            console.log("CHILL Balance Withdraw")
            withdrawOwnerTokenBalance = await withDrawTokenContract.balanceOf(ownerImpersonatedSigner.address);
            withdrawOwnerTokenBalance = parseInt(withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawOwnerTokenBalance);
            withdrawOwnerTokenBalance = withdrawOwnerTokenBalance.toFixed();
            console.log("Owner's CHILL balance after withdraw ", withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = await withDrawTokenContract.balanceOf(contract.address);
            withdrawContractTokenBalance = parseInt(withdrawContractTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawContractTokenBalance);
            withdrawContractTokenBalance = withdrawContractTokenBalance.toFixed();
            console.log("Contract CHILL Balance After withdraw", withdrawContractTokenBalance);

            console.log(">>>> GMFTM >>>>");
            withDrawTokenContract = new ethers.Contract("0x454d4BaE7c2adab588d837aFF4Db16Db19d46A33", abiERC20, owner);
            withdrawContractTokenBalance = await withDrawTokenContract.balanceOf(contract.address);
            withdrawContractTokenBalance = parseInt(withdrawContractTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawContractTokenBalance);
            withdrawContractTokenBalance = withdrawContractTokenBalance.toFixed();
            console.log("Contract GMFTM Balance before withdraw", withdrawContractTokenBalance);
            withdrawOwnerTokenBalance = await withDrawTokenContract.balanceOf(ownerImpersonatedSigner.address);
            withdrawOwnerTokenBalance = parseInt(withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawOwnerTokenBalance);
            withdrawOwnerTokenBalance = withdrawOwnerTokenBalance.toFixed();
            console.log("Owner's GMFTM balance before withdraw ", withdrawOwnerTokenBalance);
            await contract.connect(ownerImpersonatedSigner).withdrawERC20("0x454d4BaE7c2adab588d837aFF4Db16Db19d46A33");
            console.log("GMFTM Balance Withdraw")
            withdrawOwnerTokenBalance = await withDrawTokenContract.balanceOf(ownerImpersonatedSigner.address);
            withdrawOwnerTokenBalance = parseInt(withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawOwnerTokenBalance);
            withdrawOwnerTokenBalance = withdrawOwnerTokenBalance.toFixed();
            console.log("Owner's GMFTM balance after withdraw ", withdrawOwnerTokenBalance);
            withdrawContractTokenBalance = await withDrawTokenContract.balanceOf(contract.address);
            withdrawContractTokenBalance = parseInt(withdrawContractTokenBalance);
            withdrawContractTokenBalance = new BigNumber(withdrawContractTokenBalance);
            withdrawContractTokenBalance = withdrawContractTokenBalance.toFixed();
            console.log("Contract GMFTM Balance After withdraw", withdrawContractTokenBalance);
        });

    });
});

//Thanks to doublesharp
async function getTokenId(tx) {
    const _tx = tx instanceof Promise ? await tx : tx;
    const _receipt = await _tx.wait();
    const _interface = new ethers.utils.Interface([
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
    ]);
    const _data = _receipt.logs[0].data;
    const _topics = _receipt.logs[0].topics;
    const _event = _interface.decodeEventLog('Transfer', _data, _topics);
    return _event.tokenId;
}
