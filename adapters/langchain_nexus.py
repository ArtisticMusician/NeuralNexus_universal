import requests
import json
from typing import Optional, List, Dict, Any

class NeuralNexusClient:
    """Official Python client for the Neural Nexus Universal Memory API."""
    
    def __init__(self, base_url: str = "http://localhost:3000", api_key: Optional[str] = None, user_id: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.default_user_id = user_id

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    def recall(self, query: str, limit: int = 5, user_id: Optional[str] = None, max_tokens: Optional[int] = None) -> List[Dict[str, Any]]:
        """Search long-term memory."""
        payload = {
            "query": query, 
            "limit": limit, 
            "user_id": user_id or self.default_user_id,
            "max_tokens": max_tokens
        }
        response = requests.post(
            f"{self.base_url}/recall", 
            json=payload, 
            headers=self._get_headers()
        )
        response.raise_for_status()
        return response.json().get("memories", [])

    def store(self, text: str, category: str = "fact", user_id: Optional[str] = None, metadata: Optional[Dict] = None) -> bool:
        """Save a new memory."""
        payload = {
            "text": text, 
            "category": category, 
            "user_id": user_id or self.default_user_id,
            "metadata": metadata or {}
        }
        response = requests.post(
            f"{self.base_url}/store", 
            json=payload, 
            headers=self._get_headers()
        )
        return response.status_code == 201

    def reinforce(self, memory_id: str, strength_adjustment: float = 0.05) -> bool:
        """Strengthen a specific memory."""
        payload = {"memory_id": memory_id, "strength_adjustment": strength_adjustment}
        response = requests.post(
            f"{self.base_url}/reinforce", 
            json=payload, 
            headers=self._get_headers()
        )
        return response.status_code == 200

    def get_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve memory replacement logs."""
        response = requests.get(
            f"{self.base_url}/audit", 
            params={"limit": limit}, 
            headers=self._get_headers()
        )
        response.raise_for_status()
        return response.json()

    def export_memories(self, user_id: Optional[str] = None) -> str:
        """Export memories as NDJSON."""
        params = {"userId": user_id or self.default_user_id}
        response = requests.get(
            f"{self.base_url}/admin/export", 
            params=params, 
            headers=self._get_headers()
        )
        response.raise_for_status()
        return response.text

    def import_memories(self, data: str) -> Dict[str, Any]:
        """Import memories from NDJSON/JSON string."""
        response = requests.post(
            f"{self.base_url}/admin/import", 
            data=data, 
            headers={**self._get_headers(), "Content-Type": "text/plain"}
        )
        response.raise_for_status()
        return response.json()

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
    pass
