import dotenv from 'dotenv'
import TelegramBot from 'node-telegram-bot-api'
import { Agent } from '@openserv-labs/sdk'
import axios from 'axios'
import { z } from 'zod'
import { supabase } from './supabaseClient';

// Load environment variables
dotenv.config()



class SimpleTelegramBot extends Agent {
  private bot: TelegramBot
  private workspaceId: number
  private agentId: number

  constructor() {
    // Validate required environment variables
    const requiredVars = ['TELEGRAM_BOT_TOKEN', 'OPENSERV_API_KEY', 'WORKSPACE_ID', 'AGENT_ID']
    const missingVars = requiredVars.filter(varName => !process.env[varName])

    if (missingVars.length > 0) {
      console.error('❌ Missing required environment variables:', missingVars)
      process.exit(1)
    }

    // Initialize Agent (parent class)
    super({
      systemPrompt: 'You are a helpful assistant.',
      apiKey: process.env.OPENSERV_API_KEY!
    })

    // Initialize bot
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })
    this.workspaceId = parseInt(process.env.WORKSPACE_ID!)
    this.agentId = parseInt(process.env.AGENT_ID!)

    // Add debug capability to discover available agents
    this.addDebugCapability()
    //this.addTwitterCapability()
    this.addGetTwitterPostsCapability()

    this.setupHandlers()
  }

  private addTwitterCapability() {
    this.addCapability({
      name: 'getTwitterAccount',
      description: 'Gets the Twitter account for the current user',
      schema: z.object({}),
      async run({ action }) {
        const details = await this.callIntegration({
          workspaceId: action!.workspace.id,
          integrationId: 'twitter-v2',
          details: {
            endpoint: '/2/users/me',
            method: 'GET'
          }
        })

        return details.output.data.username
      }
    })
  }

  private addGetTwitterPostsCapability() {
    this.addCapability({
      name: 'getTwitterPosts',
      description: 'Gets the 10 latests Tweets',
      schema: z.object({}),
      async run({ action }) {
        const details = await this.callIntegration({
          workspaceId: action!.workspace.id,
          integrationId: 'twitter-v2',
          details: {
            endpoint: '/2/tweets/search/recent',
            method: 'GET',
            params: {
              'query': 'OpenServ',
              'tweet.fields': 'author_id,public_metrics'
            }
          }
        })

        return details.output.data.username
      }
    })
  }


  private addDebugCapability() {
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
          console.log(`${index + 1}. Name: \"${agent.name}\" | ID: ${agent.id}`)
          console.log(`   Capabilities: ${agent.capabilities_description}`)
          console.log('---')
        })

        return `Found ${action.workspace.agents.length} agents. Check console for details.`
      }
    })
  }
  

  private setupHandlers() {
    // Handle /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id
      await this.bot.sendMessage(chatId,
        '🤖 VenXas OpenServ Twitter/X Leaderboard Bot!\
\
Usage: /ask [your question]\
Example: /ask What is OpenServ?\
/tweets [text]'
      )
    })

  function parseTweetBlock(tweetTextBlock: string) {
      const tweetIdMatch = tweetTextBlock.match(/Tweet ID: (\d+)/);
      const authorMatch = tweetTextBlock.match(/Author: @(\w+).*Followers: (\d+)/);
      const retweetsMatch = tweetTextBlock.match(/Retweets: (\d+)/);
      const likesMatch = tweetTextBlock.match(/Likes: (\d+)/);
      const repliesMatch = tweetTextBlock.match(/Replies: (\d+)/);
      const textMatch = tweetTextBlock.match(/💬 Text: (.+)$/s);
    
      return {
        id: tweetIdMatch?.[1] || '',
        author: authorMatch?.[1] || '',
        followers: parseInt(authorMatch?.[2] || '0', 10),
        retweets: parseInt(retweetsMatch?.[1] || '0', 10),
        likes: parseInt(likesMatch?.[1] || '0', 10),
        replies: parseInt(repliesMatch?.[1] || '0', 10),
        text: textMatch?.[1].trim() || '',
      };
    }
    
    function scoreTweetFromParsedData(parsed: ReturnType<typeof parseTweetBlock>, index: number, wasActiveLastWeek: boolean) {
      const impact_score = (parsed.followers * 0.001) + parsed.likes + (parsed.retweets * 2);
      const freshness_multiplier = index === 0 ? 3 : index === 1 ? 2 : 1;
      const decay_factor = index === 0 ? 1 : index === 1 ? 0.5 : 0.25;
      const consistency_multiplier = wasActiveLastWeek ? 1.25 : 1;
    
      const score = impact_score * freshness_multiplier * consistency_multiplier * decay_factor;
    
      return {
        score: Math.round(score * 100) / 100,
        impact_score,
        freshness_multiplier,
        consistency_multiplier,
        decay_factor,
      };
    }
    

    
    async function saveScoredTweet(tweet: ScoredTweet) {
      const { error } = await supabase.from("tweets_scored").upsert({
        ...tweet,
        processed_at: tweet.processed_at || new Date().toISOString(),
      });

      if (error) {
        console.error(`❌ Error guardando tweet ${tweet.id_tweet}:`, error);
      } else {
        console.log(`✅ Tweet ${tweet.id_tweet} guardado con score ${tweet.score}`);
      }
    }


    // Handle /tweets command
      this.bot.onText(/\/update (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const question2 = match?.[1];
      
        if (!question2) {
          await this.bot.sendMessage(chatId, '❌ Please write a text: /tweets [text]');
          return;
        }
        this.bot.sendChatAction(chatId, 'typing');
      
        try {
          console.log(`📝 Tweet text received: \"${question2}\"`);
      
          // Fetch tweets
          const result = await this.callIntegration({
            workspaceId: 4468,
            integrationId: 'twitter-v2',
            details: {
              endpoint: '/2/tweets/search/recent',
              method: 'GET',
              params: {
                'query': 'OpenServ',
                'tweet.fields': 'author_id,public_metrics,created_at' // Include created_at field
              }
            }
          });
      
          console.log(`🚀 Task created with result: ${JSON.stringify(result)}`);
      
          if (result && typeof result === 'object' && result.output?.data?.length > 0) {
            const userScores: Record<string, { username: string; profileLink: string; score: number }> = {};
      
            await Promise.all(
              result.output.data.map(async (tweet: any, index: number) => {
                // Fetch user details for each author
                const userDetails = await this.callIntegration({
                  workspaceId: 4468,
                  integrationId: 'twitter-v2',
                  details: {
                    endpoint: `/2/users/${tweet.author_id}`,
                    method: 'GET',
                    params: {
                      'user.fields': 'username'
                    }
                  }
                });
      
                const username = userDetails.output.data.username;
                const profileLink = `https://twitter.com/${username}`;
      
                const tweetBlock = `📝 Tweet ID: ${tweet.id}\n👤 Author: @${username} \n User ID: ${tweet.author_id}\n📅 Published: ${tweet.created_at}\n📊 Metrics: Retweets: ${tweet.public_metrics.retweet_count}, Likes: ${tweet.public_metrics.like_count}, Replies: ${tweet.public_metrics.reply_count}\n💬 Text: ${tweet.text}\n`;
      
                const parsedTweet = parseTweetBlock(tweetBlock);
                //const score = scoreTweetFromParsedData(parsedTweet, index, true); // Assume active last week for now
                //save the tweet with the score
                const fullScore = scoreTweetFromParsedData(parsedTweet, index, true); // puedes ajustar el último param

                await saveScoredTweet({
                  id_tweet: tweet.id,
                  user_id: tweet.author_id,
                  username,
                  text: tweet.text,
                  published_at: tweet.created_at,
                  likes: tweet.public_metrics.like_count,
                  retweets: tweet.public_metrics.retweet_count,
                  replies: tweet.public_metrics.reply_count,
                  followers: parsedTweet.followers,

                  score: fullScore.score,
                  impact_score: fullScore.impact_score,
                  freshness_multiplier: fullScore.freshness_multiplier,
                  consistency_multiplier: fullScore.consistency_multiplier,
                  decay_factor: fullScore.decay_factor,
                  query_account: username,
                  index_in_batch: index,
                  is_first_of_week: index === 0,
                  is_second_of_week: index === 1,
                  
                  user_was_active_last_week: true // puedes cambiar según lógica real
                });

                // Aggregate scores by user
                if (!userScores[tweet.author_id]) {
                  userScores[tweet.author_id] = { username, profileLink, score: 0 };
                }
                userScores[tweet.author_id].score += score;
              })
            );
      
            // Sort users by score and take the top 10
            const leaderboard = Object.values(userScores)
              .sort((a, b) => b.score - a.score)
              .slice(0, 10);
      
            const leaderboardText = leaderboard
              .map((user, rank) => {
                let rankIcon = '🏆'; 
                if (rank === 0) rankIcon = '🥇'; 
                else if (rank === 1) rankIcon = '🥈';
                else if (rank === 2) rankIcon = '🥉'; 
                else rankIcon = `${rank + 1}️⃣`;
            
                // Add a leading space for scores less than 10
                const formattedScore = user.score < 10 ? `  ${user.score.toFixed(2)}` : user.score.toFixed(2);
            
                return `${rankIcon} ⭐ ${formattedScore} 👤 <a href="${user.profileLink}">@${user.username}</a>`;
              })
              .join('\n');
            
            await this.bot.sendMessage(chatId, leaderboardText, { parse_mode: 'HTML', disable_web_page_preview: true });

          } else {
            await this.bot.sendMessage(chatId, '❌ Sorry, I could not retrieve any tweets. Please try again.');
          }
        } catch (error) {
          console.error('Error processing question:', error);
          await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
        }
      });

    // Handle /ask command
    this.bot.onText(/\/ask (.+)/, async (msg, match) => {
      const chatId = msg.chat.id
      const question = match?.[1]

      if (!question) {
        await this.bot.sendMessage(chatId, '❌ Please write a question: /ask [your question]')
        return
      }

      // Send typing indicator
      this.bot.sendChatAction(chatId, 'typing')

      try {
        console.log(`📝 Question received: \"${question}\"`)

        // Create task for the agent
        const task = await this.createTask({
          workspaceId: this.workspaceId,
          assignee: this.agentId,
          description: 'Answer user question',
          body: `User asked: \"${question}\"\
\
Please provide a helpful and accurate answer.`,
          input: question,
          expectedOutput: 'A clear and helpful answer to the user question',
          dependencies: []
        })

        console.log(`🚀 Task created with ID: ${task.id}`)

        // Wait for task completion
        const result = await this.waitForTaskCompletion(task.id, chatId)

        if (result) {
          await this.bot.sendMessage(chatId, result)
        } else {
          await this.bot.sendMessage(chatId, '❌ Sorry, I could not answer your question. Please try again.')
        }

      } catch (error) {
        console.error('Error processing question:', error)
        await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again.')
      }
    })

    // Handle /help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id
      const helpText = `
📖 Help:

Commands:
• /start - Start the bot
• /ask [question] - Ask a question
• /help - Show this help message

Example:
/ask Give information about OpenServ platform
      `
      await this.bot.sendMessage(chatId, helpText)
    })

    // Error handling
    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error)
    })

    console.log('✅ Telegram bot handlers set up successfully!')
  }

  private async waitForTaskCompletion(taskId: number, chatId: number): Promise<string | null> {
    const maxWaitTime = 120000 // 2 minutes
    const pollInterval = 5000   // 5 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Continue typing indicator
        this.bot.sendChatAction(chatId, 'typing')

        // Check task status
        const taskDetail = await this.getTaskDetail({
          taskId: taskId,
          workspaceId: this.workspaceId
        })

        console.log(`⏳ Task ${taskId} status: ${taskDetail?.status}`)

        if (taskDetail?.status === 'done') {
          console.log(`✅ Task completed!`)

          // Check for output file
          if (taskDetail.attachments && taskDetail.attachments.length > 0) {
            try {
              const files = await this.getFiles({ workspaceId: this.workspaceId })
              const resultFile = files.find((file: any) =>
                taskDetail.attachments?.some((att: any) => file.path?.includes(att.path))
              )

              if (resultFile) {
                const fileContent = await axios.get(resultFile.fullUrl)

                // Clean up the file
                await this.deleteFile({
                  workspaceId: this.workspaceId,
                  fileId: resultFile.id
                }).catch(() => { })

                return fileContent.data || 'Task completed but could not retrieve result.'
              }
            } catch (fileError) {
              console.error('Error reading result file:', fileError)
            }
          }

          // If no file attachment, check task output
          if (taskDetail.output) {
            return taskDetail.output
          }

          return 'Task completed.'
        }

        if (taskDetail?.status === 'error') {
          console.error(`❌ Task failed`)
          return null
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval))

      } catch (pollError) {
        console.error('Error during polling:', pollError)
        // Continue polling despite errors
      }
    }

    console.log(`⏰ Task ${taskId} timeout`)
    return 'Timeout. The task might still be processing.'
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Simple OpenServ Telegram Bot...')

      // Start the OpenServ agent server
      await super.start()

      console.log('✅ Bot is running! Send /start to begin.')

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\
⏹️ Shutting down bot...')
        this.bot.stopPolling()
        process.exit(0)
      })

    } catch (error) {
      console.error('❌ Error starting bot:', error)
      process.exit(1)
    }
  }
}

// Start the bot
if (require.main === module) {
  const bot = new SimpleTelegramBot()
  bot.start()
}

export default SimpleTelegramBot
