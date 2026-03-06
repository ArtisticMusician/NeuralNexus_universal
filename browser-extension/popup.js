const API_URL = "http://localhost:3000";

document.getElementById('searchBtn').addEventListener('click', async () => {
  const query = document.getElementById('query').value;
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = 'Searching...';

  try {
    const response = await fetch(`${API_URL}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 3 })
    });
    const data = await response.json();
    
    resultsDiv.innerHTML = data.memories.map(m => `
      <div class="memory">
        <strong>[${m.category}]</strong> ${m.text}
      </div>
    `).join('') || 'No memories found.';
  } catch (err) {
    resultsDiv.innerHTML = 'Error connecting to Nexus.';
  }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const text = document.getElementById('manualText').value;
  if (!text) return;

  try {
    const response = await fetch(`${API_URL}/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, category: "fact" })
    });
    if (response.ok) {
      document.getElementById('manualText').value = '';
      alert('Memory saved!');
    }
  } catch (err) {
    alert('Error saving memory.');
  }
});
