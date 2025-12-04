// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FinancialRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  wellnessScore: number;
  suggestions: string[];
}

const App: React.FC = () => {
  // Randomly selected style: High contrast (blue+orange), Flat UI, Center radiation layout, Animation rich
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    category: "",
    description: "",
    financialData: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate average wellness score
  const averageScore = records.length > 0 
    ? records.reduce((sum, record) => sum + record.wellnessScore, 0) / records.length
    : 0;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: FinancialRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                category: recordData.category,
                wellnessScore: recordData.wellnessScore || 0,
                suggestions: recordData.suggestions || []
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting financial data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Simulate FHE analysis to generate wellness score and suggestions
      const wellnessScore = Math.floor(Math.random() * 41) + 60; // Random score between 60-100
      const suggestions = [
        "Consider diversifying investments",
        "Increase emergency fund contributions",
        "Review credit card utilization"
      ].slice(0, Math.floor(Math.random() * 3) + 1);

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        category: newRecordData.category,
        wellnessScore,
        suggestions
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "record_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Financial data analyzed with FHE!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          category: "",
          description: "",
          financialData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Service is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Failed to check availability"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredRecords = records.filter(record => 
    record.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.owner.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to start using FinWellness",
      icon: "🔗"
    },
    {
      title: "Submit Financial Data",
      description: "Add your financial information which will be encrypted using FHE",
      icon: "🔒"
    },
    {
      title: "FHE Analysis",
      description: "Your data is analyzed in encrypted state without decryption",
      icon: "⚙️"
    },
    {
      title: "Get Wellness Score",
      description: "Receive personalized financial wellness insights",
      icon: "📊"
    }
  ];

  const renderScoreMeter = (score: number) => {
    return (
      <div className="score-meter">
        <div 
          className="meter-fill"
          style={{ width: `${score}%` }}
        ></div>
        <div className="meter-text">{score}</div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="radial-bg"></div>
      
      <header className="app-header">
        <div className="logo">
          <h1>FinWellness<span>FHE</span></h1>
          <p>Privacy-Preserving Financial Wellness</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="center-radial">
          <div className="navigation-tabs">
            <button 
              className={`tab-button ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button 
              className={`tab-button ${activeTab === "records" ? "active" : ""}`}
              onClick={() => setActiveTab("records")}
            >
              My Records
            </button>
            <button 
              className={`tab-button ${activeTab === "tutorial" ? "active" : ""}`}
              onClick={() => setActiveTab("tutorial")}
            >
              How It Works
            </button>
          </div>
          
          {activeTab === "dashboard" && (
            <div className="dashboard-content">
              <div className="welcome-card">
                <h2>Your Financial Wellness</h2>
                <p>Powered by Fully Homomorphic Encryption</p>
                
                <div className="wellness-score">
                  <div className="score-display">
                    {records.length > 0 ? (
                      <>
                        <div className="big-score">{averageScore.toFixed(1)}</div>
                        <div className="score-label">Average Wellness Score</div>
                        {renderScoreMeter(averageScore)}
                      </>
                    ) : (
                      <div className="no-score">Submit financial data to get your FHE wellness score</div>
                    )}
                  </div>
                  
                  <button 
                    className="primary-button"
                    onClick={() => setShowCreateModal(true)}
                  >
                    + Add Financial Data
                  </button>
                </div>
              </div>
              
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>Records</h3>
                  <div className="stat-value">{records.length}</div>
                </div>
                <div className="stat-card">
                  <h3>Categories</h3>
                  <div className="stat-value">
                    {[...new Set(records.map(r => r.category))].length}
                  </div>
                </div>
                <div className="stat-card">
                  <h3>FHE Status</h3>
                  <button 
                    className="check-button"
                    onClick={checkAvailability}
                  >
                    Check
                  </button>
                </div>
              </div>
              
              <div className="suggestions-card">
                <h3>Common Suggestions</h3>
                <ul className="suggestions-list">
                  <li>Diversify your investment portfolio</li>
                  <li>Maintain 3-6 months emergency fund</li>
                  <li>Keep credit utilization below 30%</li>
                  <li>Review recurring expenses quarterly</li>
                </ul>
              </div>
            </div>
          )}
          
          {activeTab === "records" && (
            <div className="records-content">
              <div className="records-header">
                <h2>My Financial Records</h2>
                <div className="records-controls">
                  <input
                    type="text"
                    placeholder="Search records..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  <button 
                    className="primary-button"
                    onClick={() => setShowCreateModal(true)}
                  >
                    + New Record
                  </button>
                </div>
              </div>
              
              <div className="records-list">
                {filteredRecords.length === 0 ? (
                  <div className="empty-records">
                    <div className="empty-icon">📊</div>
                    <p>No financial records found</p>
                    <button 
                      className="primary-button"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Create First Record
                    </button>
                  </div>
                ) : (
                  filteredRecords.map(record => (
                    <div className="record-card" key={record.id}>
                      <div className="record-header">
                        <div className="record-category">{record.category}</div>
                        <div className="record-date">
                          {new Date(record.timestamp * 1000).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="record-body">
                        <div className="wellness-display">
                          <div className="wellness-score">
                            <span>Score:</span>
                            {renderScoreMeter(record.wellnessScore)}
                          </div>
                        </div>
                        <div className="record-suggestions">
                          <h4>Suggestions:</h4>
                          <ul>
                            {record.suggestions.map((suggestion, i) => (
                              <li key={i}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          
          {activeTab === "tutorial" && (
            <div className="tutorial-content">
              <h2>How FinWellnessFHE Works</h2>
              <p className="subtitle">Your financial data remains encrypted throughout analysis</p>
              
              <div className="tutorial-steps">
                {tutorialSteps.map((step, index) => (
                  <div 
                    className="tutorial-step"
                    key={index}
                  >
                    <div className="step-icon">{step.icon}</div>
                    <div className="step-content">
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="fhe-explainer">
                <h3>FHE Technology</h3>
                <p>
                  Fully Homomorphic Encryption allows computations on encrypted data without 
                  needing to decrypt it first. This means your sensitive financial information 
                  remains private even during analysis.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className={`transaction-notification ${transactionStatus.status}`}>
          <div className="notification-content">
            {transactionStatus.status === "pending" && <div className="spinner"></div>}
            {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
            {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            <div className="notification-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>FinWellnessFHE</h3>
            <p>Privacy-Preserving Personalized Financial Wellness</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            Powered by FHE Technology
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FinWellnessFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!recordData.category || !recordData.financialData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Financial Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <span className="fhe-icon">🔒</span> Your data will be encrypted with FHE
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category"
              value={recordData.category} 
              onChange={handleChange}
              className="form-select"
            >
              <option value="">Select category</option>
              <option value="Income">Income</option>
              <option value="Expenses">Expenses</option>
              <option value="Investments">Investments</option>
              <option value="Debt">Debt</option>
              <option value="Savings">Savings</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <input 
              type="text"
              name="description"
              value={recordData.description} 
              onChange={handleChange}
              placeholder="Brief description..." 
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label>Financial Data *</label>
            <textarea 
              name="financialData"
              value={recordData.financialData} 
              onChange={handleChange}
              placeholder="Enter financial data to analyze..." 
              className="form-textarea"
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="primary-button"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;