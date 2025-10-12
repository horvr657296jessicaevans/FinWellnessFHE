// FinWellnessFHE.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FinWellnessFHE is SepoliaConfig {
    struct EncryptedFinancialData {
        uint256 id;
        euint32 encryptedIncome;
        euint32 encryptedExpenses;
        euint32 encryptedSavings;
        uint256 timestamp;
    }
    
    struct WellnessScore {
        euint32 encryptedFinancialScore;
        euint32 encryptedRiskAssessment;
        euint32 encryptedImprovementScore;
    }

    struct DecryptedFinancialData {
        uint32 income;
        uint32 expenses;
        uint32 savings;
        bool isRevealed;
    }

    uint256 public dataCount;
    mapping(uint256 => EncryptedFinancialData) public encryptedFinancialData;
    mapping(uint256 => DecryptedFinancialData) public decryptedFinancialData;
    mapping(address => WellnessScore) public wellnessScores;
    
    mapping(uint256 => uint256) private requestToDataId;
    
    event DataSubmitted(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed dataId);
    event ScoreCalculated(uint256 indexed dataId);
    event DecryptionRequested(uint256 indexed dataId);
    event DataDecrypted(uint256 indexed dataId);
    
    modifier onlyOwner(uint256 dataId) {
        _;
    }
    
    function submitEncryptedFinancialData(
        euint32 encryptedIncome,
        euint32 encryptedExpenses,
        euint32 encryptedSavings
    ) public {
        dataCount += 1;
        uint256 newId = dataCount;
        
        encryptedFinancialData[newId] = EncryptedFinancialData({
            id: newId,
            encryptedIncome: encryptedIncome,
            encryptedExpenses: encryptedExpenses,
            encryptedSavings: encryptedSavings,
            timestamp: block.timestamp
        });
        
        decryptedFinancialData[newId] = DecryptedFinancialData({
            income: 0,
            expenses: 0,
            savings: 0,
            isRevealed: false
        });
        
        emit DataSubmitted(newId, block.timestamp);
    }
    
    function requestDataDecryption(uint256 dataId) public onlyOwner(dataId) {
        EncryptedFinancialData storage data = encryptedFinancialData[dataId];
        require(!decryptedFinancialData[dataId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(data.encryptedIncome);
        ciphertexts[1] = FHE.toBytes32(data.encryptedExpenses);
        ciphertexts[2] = FHE.toBytes32(data.encryptedSavings);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptFinancialData.selector);
        requestToDataId[reqId] = dataId;
        
        emit DecryptionRequested(dataId);
    }
    
    function decryptFinancialData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        require(dataId != 0, "Invalid request");
        
        EncryptedFinancialData storage eData = encryptedFinancialData[dataId];
        DecryptedFinancialData storage dData = decryptedFinancialData[dataId];
        require(!dData.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        
        dData.income = results[0];
        dData.expenses = results[1];
        dData.savings = results[2];
        dData.isRevealed = true;
        
        emit DataDecrypted(dataId);
    }
    
    function requestWellnessAnalysis(uint256 dataId) public onlyOwner(dataId) {
        require(encryptedFinancialData[dataId].id != 0, "Data not found");
        
        emit AnalysisRequested(dataId);
    }
    
    function submitWellnessScore(
        address userAddress,
        euint32 encryptedFinancialScore,
        euint32 encryptedRiskAssessment,
        euint32 encryptedImprovementScore
    ) public {
        wellnessScores[userAddress] = WellnessScore({
            encryptedFinancialScore: encryptedFinancialScore,
            encryptedRiskAssessment: encryptedRiskAssessment,
            encryptedImprovementScore: encryptedImprovementScore
        });
        
        emit ScoreCalculated(dataCount);
    }
    
    function requestScoreDecryption(address userAddress, uint8 scoreType) public {
        WellnessScore storage score = wellnessScores[userAddress];
        require(FHE.isInitialized(score.encryptedFinancialScore), "No score available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (scoreType == 0) {
            ciphertexts[0] = FHE.toBytes32(score.encryptedFinancialScore);
        } else if (scoreType == 1) {
            ciphertexts[0] = FHE.toBytes32(score.encryptedRiskAssessment);
        } else if (scoreType == 2) {
            ciphertexts[0] = FHE.toBytes32(score.encryptedImprovementScore);
        } else {
            revert("Invalid score type");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptWellnessScore.selector);
        requestToDataId[reqId] = uint256(uint160(userAddress)) * 10 + scoreType;
    }
    
    function decryptWellnessScore(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToDataId[requestId];
        address userAddress = address(uint160(compositeId / 10));
        uint8 scoreType = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 score = abi.decode(cleartexts, (uint32));
    }
    
    function getDecryptedFinancialData(uint256 dataId) public view returns (
        uint32 income,
        uint32 expenses,
        uint32 savings,
        bool isRevealed
    ) {
        DecryptedFinancialData storage d = decryptedFinancialData[dataId];
        return (d.income, d.expenses, d.savings, d.isRevealed);
    }
    
    function hasWellnessScore(address userAddress) public view returns (bool) {
        return FHE.isInitialized(wellnessScores[userAddress].encryptedFinancialScore);
    }
}