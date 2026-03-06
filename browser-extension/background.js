chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "saveToNeuralNexus",
    title: "Save to Neural Nexus",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveToNeuralNexus" && info.selectionText) {
    saveToNexus(info.selectionText);
  }
});

async function saveToNexus(text) {
  const API_URL = "http://localhost:3000/store";
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        text, 
        category: "fact",
        metadata: { source: "browser_extension" }
      })
    });
    
    if (response.ok) {
      console.log("Memory stored successfully!");
      // Optional: Send message to content script to show a toast
    }
  } catch (err) {
    console.error("Failed to save to Neural Nexus:", err);
  }
}
