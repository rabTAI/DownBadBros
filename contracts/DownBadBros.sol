/*
DownBadBros: Rugged, Scammed, Rekt, Sold the bottom. Can they make it all back?
*/

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IRandomNumberGenerator {
    function getRandomNumber() external view returns (uint256);
}

interface IBeetsValut {
    function getPoolTokens(
        bytes32
    ) external view returns (IERC20[] memory, uint256[] memory, uint256);
}

interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

struct Epoch {
    uint128 randomness;
    uint64 revealBlock;
    bool commited;
    bool revealed;
}

contract DownBadBros is ERC721, ReentrancyGuard {
    using Strings for uint256;
    using Counters for Counters.Counter;
    Counters.Counter private supply;

    address public owner;
    address public constant RANDOM = 0x54F3f10f95363c8CBa51c7f6f6b70FaFF9e79Eb4;
    bytes32 public merkleRoot =
        0x3393612c92e3bb3fe1fa482ed0cd6a1055acf18f1e362ceb26047a9af55850ff;

    string public baseURI =
        "ipfs://bafybeiflr4jbtqg77f2fhpvxearwau5x3dextrf6dy5i5vxnd363uncazu/";
    address public constant beetsValut =
        0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce;

    bool public mintPaused = true;
    bool public publicMint = false;

    uint256 public constant mintCost = 50 ether;
    uint16 public constant maxSupply = 999;
    uint256 public constant maxPerTx = 5;
    uint16[maxSupply] private ids;
    uint16 private index = 0;

    uint256 private epochIndex = 1;
    mapping(uint256 => Epoch) private epochs;
    uint256 private randomIndexEpoch;

    constructor() ERC721("Down Bad Bros", "DBB") {
        owner = 0x36D94F96ff51d344a5efCAD2309411F97dC54827;
        resolveEpochIfNeeded();
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not a contract owner");
        _;
    }

    //** Read Functions **

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function tokenURI(
        uint256 tokenId
    ) public view virtual override returns (string memory) {
        require(
            _exists(tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );
        return string(abi.encodePacked(_baseURI(), tokenId.toString()));
    }

    function totalSupply() public view returns (uint256) {
        return supply.current();
    }

    //** Write Functions **

    function mint(
        bytes32[] calldata _merkleProof,
        uint256 _mintAmount
    ) public payable {
        require(supply.current() + _mintAmount <= maxSupply, "Max supply");
        require(_mintAmount > 0, "Need more than 0");
        if (msg.sender != owner) {
            require(!mintPaused, "Minting is paused");
            require(_mintAmount <= 5, "Limit per TX");
            if (!publicMint) {
                bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
                require(
                    MerkleProof.verify(_merkleProof, merkleRoot, leaf),
                    "Not in whitelist"
                );
            }
            require(msg.value >= mintCost * _mintAmount, "Not enough FTM");
        }
        for (uint256 i = 1; i <= _mintAmount; i++) {
            supply.increment();
            resolveEpochIfNeeded();
            uint256 _randomNumber = getRandomNumber();
            _safeMint(msg.sender, pickRandomUniqueId(_randomNumber) + 1);
        }
    }

    function mintWithToken(
        bytes32[] calldata _merkleProof,
        string memory _tokenName,
        uint256 _mintAmount
    ) public {
        require(!mintPaused, "Minting is paused");
        require(supply.current() + _mintAmount <= maxSupply, "Max supply");
        require(_mintAmount > 0, "Need more than 0");
        require(_mintAmount <= 5, "Limit per TX");
        if (!publicMint) {
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
            require(
                MerkleProof.verify(_merkleProof, merkleRoot, leaf),
                "Not in whitelist"
            );
        }
        (
            address _mintingTokenContract,
            uint256 _tokenPerFTM
        ) = getTokenNeededPerFTM(_tokenName);

        uint256 _totalTokenNeeded = _mintAmount * (_tokenPerFTM * 50);

        require(
            IERC20(_mintingTokenContract).balanceOf(msg.sender) >=
                _totalTokenNeeded,
            "Not enough TOKEN in wallet"
        );
        require(
            IERC20(_mintingTokenContract).allowance(
                msg.sender,
                address(this)
            ) >= _totalTokenNeeded,
            "Need an allowance"
        );
        require(
            IERC20(_mintingTokenContract).transferFrom(
                msg.sender,
                address(this),
                _totalTokenNeeded
            ),
            "Token did not transfer"
        );
        for (uint256 i = 1; i <= _mintAmount; i++) {
            supply.increment();
            resolveEpochIfNeeded();
            uint256 _randomNumber = getRandomNumber();
            _safeMint(msg.sender, pickRandomUniqueId(_randomNumber) + 1);
        }
    }

    //** Only Owner Functions **

    function flipMintState() public onlyOwner {
        mintPaused = !mintPaused;
    }

    function enablePublicMint() public onlyOwner {
        publicMint = true;
    }

    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
    }

    function setMerkleRoot(bytes32 _merkleRoot) public onlyOwner {
        merkleRoot = _merkleRoot;
    }

    function withdraw() public onlyOwner {
        (bool success, ) = payable(msg.sender).call{
            value: address(this).balance
        }("");
        require(success);
    }

    function withdrawERC20(address _token) public onlyOwner {
        uint256 _balance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).transfer(msg.sender, _balance);
    }

    //** Support Functions **

    function pickRandomUniqueId(uint256 _random) private returns (uint256 id) {
        uint256 len = ids.length - index++;
        require(len > 0, "no ids left");
        uint256 _randomIndex = _random % len;
        id = ids[_randomIndex] != 0 ? ids[_randomIndex] : _randomIndex;
        ids[_randomIndex] = uint16(ids[len - 1] == 0 ? len - 1 : ids[len - 1]);
        ids[len - 1] = 0;
    }

    function getRandomNumber() private view returns (uint256 _randomNumber) {
        _randomNumber = uint256(
            keccak256(
                abi.encodePacked(
                    epochs[randomIndexEpoch].randomness,
                    IRandomNumberGenerator(RANDOM).getRandomNumber()
                )
            )
        );
    }

    function getTokenNeededPerFTM(
        string memory _tokenName
    )
        public
        view
        returns (address _mintingTokenContract, uint256 _tokenPerFTM)
    {
        if (
            keccak256(abi.encodePacked(_tokenName)) ==
            keccak256(abi.encodePacked("CONK"))
        ) {
            (, uint256[] memory _amount, ) = IBeetsValut(beetsValut)
                .getPoolTokens(
                    0x4707eed23f628de1a032235158e33bc3c9fcf2f4000100000000000000000661
                );

            //FTM: 0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83
            //Index 1 : 15%
            //CONK: 0xb715F8DcE2F0E9b894c753711bd55eE3C04dcA4E
            //Index 2: 60%

            uint256 _totalFTM = _amount[1] * 4;
            uint256 _totalCONK = _amount[2];
            _mintingTokenContract = 0xb715F8DcE2F0E9b894c753711bd55eE3C04dcA4E;
            _tokenPerFTM = (_totalCONK / _totalFTM) * 10 ** 18;
        } else if (
            keccak256(abi.encodePacked(_tokenName)) ==
            keccak256(abi.encodePacked("CHILL"))
        ) {
            //FTM: 0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83
            //Index 0 : 50%
            //CHILL: 0xe47d957F83F8887063150AaF7187411351643392
            //Index 1: 50%

            (uint256 _totalFTM, uint256 _totalCHILL, ) = IUniswapV2Pair(
                0x11a0779eA92176298b7A2760AE29fC9Ce1aD47b4
            ).getReserves();

            _mintingTokenContract = 0xe47d957F83F8887063150AaF7187411351643392;
            _tokenPerFTM = (_totalCHILL / _totalFTM) * 10 ** 18;
        } else if (
            keccak256(abi.encodePacked(_tokenName)) ==
            keccak256(abi.encodePacked("GMFTM"))
        ) {
            (, uint256[] memory _amount, ) = IBeetsValut(beetsValut)
                .getPoolTokens(
                    0xc38c84909c590fa6898839457ff87d08a0aa0bb500020000000000000000067a
                );

            //FTM: 0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83
            //Index 0 : 55%
            //GMFTM: 0x454d4BaE7c2adab588d837aFF4Db16Db19d46A33
            //Index 1: 45%

            uint256 _totalFTM = (_amount[0] * 45);
            uint256 _totalGM = (_amount[1] * 55);
            _mintingTokenContract = 0x454d4BaE7c2adab588d837aFF4Db16Db19d46A33;
            _tokenPerFTM = (_totalGM / _totalFTM) * 10 ** 18;
        } else {
            revert("Token is not allowed");
        }
    }

    //Thanks to MouseDev
    function resolveEpochIfNeeded() private {
        Epoch storage currentEpoch = epochs[epochIndex];
        if (
            //If epoch has been commited
            currentEpoch.commited == false ||
            //If epoch has not been revealed, but the block is too far away (256 blocks)
            (currentEpoch.revealed == false &&
                currentEpoch.revealBlock < block.number - 256)
        ) {
            //This means the epoch has not been commited, OR the epoch has commited but has expired
            //Set commited to true  and record the reveal block
            currentEpoch.revealBlock = uint64(block.number + 5);
            currentEpoch.commited = true;
        } else if (block.number > currentEpoch.revealBlock) {
            //Epoch has been commited and is within range to be revealed
            //Set its randomness to the target block
            currentEpoch.randomness = uint128(
                uint256(blockhash(currentEpoch.revealBlock)) % (2 ** 128 - 1)
            );
            currentEpoch.revealed = true;
            randomIndexEpoch = epochIndex;
            epochIndex++;
            return resolveEpochIfNeeded();
        }
    }
}
