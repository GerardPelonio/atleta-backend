async function listAvailableModels() {
  require('dotenv').config();
  const geminiKey = process.env.GEMINI_API_KEY;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
    const data = await res.json();
    console.log('Available models for key:');
    if (data.models) {
      data.models.forEach((m: any) => {
        console.log(`- ${m.name} (${m.displayName}) - methods: ${m.supportedGenerationMethods?.join(', ')}`);
      });
    } else {
      console.log('Response:', data);
    }
  } catch (err) {
    console.error('Error listing models:', err);
  }
}

listAvailableModels();
