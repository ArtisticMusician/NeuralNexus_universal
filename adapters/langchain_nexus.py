import requests
import json
from typing import Optional, List, Dict, Any

class NeuralNexusClient:
    """Standard Python client for interacting with the Neural Nexus Universal Memory API."""
    
    def __init__(self, base_url: str = "http://localhost:3000", user_id: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.user_id = user_id

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.user_id:
            headers["user-id"] = self.user_id
        return headers

    def recall(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search long-term memory."""
        payload = {"query": query, "limit": limit}
        response = requests.post(
            f"{self.base_url}/recall", 
            json=payload, 
            headers=self._get_headers()
        )
        response.raise_for_status()
        return response.json().get("memories", [])

    def store(self, text: str, category: str = "fact", metadata: Optional[Dict] = None) -> bool:
        """Save a new memory."""
        payload = {"text": text, "category": category, "metadata": metadata or {}}
        response = requests.post(
            f"{self.base_url}/store", 
            json=payload, 
            headers=self._get_headers()
        )
        return response.status_code == 201

# --- LangChain Tool Integration ---

try:
    from langchain.tools import tool

    @tool
    def recall_memory(query: str, limit: int = 5) -> str:
        """Search your long-term memory for relevant past information, preferences, or facts."""
        client = NeuralNexusClient()
        memories = client.recall(query, limit)
        if not memories:
            return "No relevant memories found."
        
        results = []
        for m in memories:
            results.append(f"- {m['text']} (Score: {m['metadata'].get('decayed_score', 'N/A')})")
        return "\n".join(results)

    @tool
    def store_memory(text: str, category: str = "fact") -> str:
        """Save important information, facts, or user preferences to long-term memory."""
        client = NeuralNexusClient()
        success = client.store(text, category)
        return "Memory stored successfully." if success else "Failed to store memory."

except ImportError:
    pass # LangChain not installed
