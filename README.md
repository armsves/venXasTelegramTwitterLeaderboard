# Simple Telegram OpenServ Bot

The simplest Telegram bot - OpenServ agent integration.

## 🎯 What Does It Do?

1. Receives `/ask [question]` command from Telegram
2. Creates a task for the specified agent in OpenServ
3. Waits for task completion
4. Sends the response to the same chat

## 🚀 Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment File
```bash
cp .env.example .env
```

Edit the `.env` file:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
OPENSERV_API_KEY=your_openserv_api_key_here
WORKSPACE_ID=your_workspace_id_here
AGENT_ID=your_agent_id_here
```

### 3. Run
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 📱 Usage

### Commands
- `/start` - Start the bot
- `/ask [question]` - Ask a question
- `/help` - Help

### Examples
```
/ask What is OpenServ?
/ask What is the BTC price?
/ask How is the weather?
```

## ⚙️ Requirements

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | ✅ |
| `OPENSERV_API_KEY` | OpenServ API key | ✅ |
| `WORKSPACE_ID` | OpenServ workspace ID | ✅ |
| `AGENT_ID` | Agent ID to use | ✅ |

### OpenServ Agents
You can use any of the available agents on the platform:

- **Research Assistant (ID: 2)** - Internet research
- **General Assistant (ID: 3)** - General questions, code analysis
- **Essay Writer (ID: 6)** - Article writing
- **Coder (ID: 39)** - Code writing and analysis
- **Copywriter (ID: 41)** - Content writing
- **Perplexity Research Assistant (ID: 140)** - Web research
- **Audio transcriber (ID: 155)** - Audio transcription

#### Finding Other Agent IDs
To discover additional agents and their IDs:

1. **Marketplace Agents**: Visit [https://platform.openserv.ai/agents](https://platform.openserv.ai/agents) and check the network request `https://api.openserv.ai/marketplace/agents?page=...&pageSize=...` that loads when the page opens.

2. **Your Own Agents**: Visit [https://platform.openserv.ai/developer/agents](https://platform.openserv.ai/developer/agents) and examine the response from the `https://api.openserv.ai/agents?ownerId=...` request to see your created agents.

3. **Debug by Logging Available Agents**: Add a simple capability to your bot to see all available agents in your workspace:

```typescript
// Add this temporary capability to see available agents
this.addCapability({
  name: 'debugAgents',
  description: 'Debug: log all available agents',
  schema: z.object({}),
  async run({ args, action }) {
    if (!action?.workspace?.agents) {
      console.log('❌ No workspace agents available')
      return 'No workspace context available'
    }
    
    console.log('🔍 Available Agents in Workspace:')
    action.workspace.agents.forEach((agent, index) => {
      console.log(`${index + 1}. Name: "${agent.name}" | ID: ${agent.id}`)
      console.log(`   Capabilities: ${agent.capabilities_description}`)
      console.log('---')
    })
    
    return `Found ${action.workspace.agents.length} agents. Check console for details.`
  }
})
```

Then use `/ask debug agents` to see all available agents in your console output.

## 🔧 Code Structure

```typescript
class SimpleTelegramBot {
  // 1. Receives Telegram message
  // 2. Creates task in OpenServ  
  // 3. Waits for task completion
  // 4. Sends result to Telegram
}
```

### Main Functions
- `setupHandlers()` - Telegram command handlers
- `waitForTaskCompletion()` - Wait for task completion
- `start()` - Start the bot

## 🐛 Troubleshooting

### Bot not responding
- Check environment variables
- Is the OpenServ API key valid?
- Is the Agent ID correct?

### Task timeout
- Agent might be too busy
- Try a different agent
- Is the Workspace ID correct?

### Telegram connection issue
- Check bot token
- Is there an internet connection?

### Finding Available Agents
If you don't know which agents are available in your workspace, add the debug capability above and use:
```
/ask debug agents
```
This will show all available agents with their IDs and capabilities in your console output.

### Example Console Output:
```
🔍 Available Agents in Workspace:
1. Name: "Research Assistant" | ID: 2
   Capabilities: - Search on the internet about a certain topic...
---
2. Name: "General Assistant" | ID: 3  
   Capabilities: - Do data analysis, Create PDF reports...
---
3. Name: "Coder" | ID: 39
   Capabilities: - Analyze datasets using code, Write python code...
---
```

## 📋 Example .env
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHijklMNOpqrsTUVwxyz
OPENSERV_API_KEY=openserv_key_123abc...
WORKSPACE_ID=123
AGENT_ID=2
```

## 🔄 Workflow

1. **User**: `/ask What is OpenServ?`
2. **Bot**: Create task (Agent ID: 2)
3. **OpenServ**: Process task
4. **Bot**: Check result
5. **Bot**: Send response to Telegram

## 💡 Customization

### Using Different Agent
Change `AGENT_ID` in `.env` file:
```env
AGENT_ID=140  # For Perplexity Research
```

### Changing Timeout Duration
Change `maxWaitTime` in `src/index.ts` file:
```typescript
const maxWaitTime = 180000 // 3 minutes
```