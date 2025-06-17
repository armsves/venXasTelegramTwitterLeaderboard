import dotenv from 'dotenv'
import TelegramBot from 'node-telegram-bot-api'
import { Agent } from '@openserv-labs/sdk'
import axios from 'axios'
import { z } from 'zod'

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

    this.setupHandlers()
  }

  private setupHandlers() {
    // Handle /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id
      await this.bot.sendMessage(chatId,
        '🤖 VenXas OpenServ Twitter/X Leaderboard Bot!\n\
\
Usage: /leaderboard [project handle]\n\
Example: /leaderboard OpenServ\
'
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

    function scoreTweetFromParsedData(parsed: ReturnType<typeof parseTweetBlock>, index: number, wasActiveLastWeek: boolean): number {
      const impactScore = (parsed.followers * 0.001) + parsed.likes + (parsed.retweets * 2);

      // Assign a base score if impactScore is 0
      const baseScore = impactScore === 0 ? 1 : impactScore;

      const freshnessMultiplier = index === 0 ? 3 : index === 1 ? 2 : 1;
      const decayFactor = index === 0 ? 1 : index === 1 ? 0.5 : 0.25;
      const consistencyMultiplier = wasActiveLastWeek ? 1.25 : 1;

      const finalScore = baseScore * freshnessMultiplier * consistencyMultiplier * decayFactor;

      return Math.round(finalScore * 100) / 100;
    }

    // Handle /tweets command
    this.bot.onText(/\/leaderboard (.+)/, async (msg, match) => {
      const chatId = msg.chat.id
      const question = match?.[1]

      if (!question) {
        await this.bot.sendMessage(chatId, '❌ Please write a project to show the leaderboard: /leaderboard [your project]')
        return
      }

      this.bot.sendChatAction(chatId, 'typing');

      try {
        console.log(`📝 Fetching tweets...`);

        const allTweets: any[] = [];
        let nextToken: string | undefined = undefined;

        // Fetch up to 10 pages of tweets
        for (let page = 0; page < 10; page++) {
          const result = await this.callIntegration({
            workspaceId: 4468,
            integrationId: 'twitter-v2',
            details: {
              endpoint: '/2/tweets/search/recent',
              method: 'GET',
              params: {
                'query': question,
                'tweet.fields': 'author_id,public_metrics,created_at',
                'max_results': 10,
                ...(nextToken ? { 'next_token': nextToken } : {})
              }
            }
          });

          console.log(`🚀 Page ${page + 1} fetched with result: ${JSON.stringify(result)}`);

          if (result && typeof result === 'object' && result.output?.data?.length > 0) {
            allTweets.push(...result.output.data);
            nextToken = result.output.meta?.next_token;

            if (!nextToken) break;
          } else {
            console.log(`❌ No more tweets found.`);
            break;
          }
        }

        console.log(`✅ Fetched ${allTweets.length} tweets in total.`);

        if (allTweets.length > 0) {
          const userScores: Record<string, { username: string; profileLink: string; score: number }> = {};

          await Promise.all(
            allTweets.map(async (tweet: any, index: number) => {
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
              const score = scoreTweetFromParsedData(parsedTweet, index, true); // Assume active last week for now

              // Aggregate scores by user
              if (!userScores[tweet.author_id]) {
                userScores[tweet.author_id] = { username, profileLink, score: 0 };
              }
              userScores[tweet.author_id].score += score;
            })
          );

          // Sort users by score and take the top 10
          const leaderboard = Object.values(userScores)
            .filter(user => user.username !== 'openservai') // Exclude 'openservai'
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
          
          const leaderboardHeader = `<b>Leaderboard for "${question}"</b>\n\n`;
          
          const leaderboardText = leaderboard
            .map((user, rank) => {
              let rankIcon = '🏆'; // Default trophy icon
              if (rank === 0) rankIcon = '🥇'; // Gold medal for 1st place
              else if (rank === 1) rankIcon = '🥈'; // Silver medal for 2nd place
              else if (rank === 2) rankIcon = '🥉'; // Bronze medal for 3rd place
              else if (rank === 9) rankIcon = '🔟'; // Special icon for rank 10
              else rankIcon = `${rank + 1}️⃣`; // Numbered icon for ranks 4th to 9th
          
              // Add consistent spacing for scores
              let formattedScore = user.score.toFixed(2);
              if (user.score < 10) formattedScore = `   ${formattedScore}`; // Add extra spaces for scores < 10
              else if (user.score < 100) formattedScore = `  ${formattedScore}`; // Add extra spaces for scores < 100
          
              return `${rankIcon} ⭐ ${formattedScore} 👤 <a href="${user.profileLink}">@${user.username}</a>`;
            })
            .join('\n'); // Add line breaks between entries
          
          await this.bot.sendMessage(chatId, leaderboardHeader + leaderboardText, { parse_mode: 'HTML', disable_web_page_preview: true });
        } else {
          await this.bot.sendMessage(chatId, '❌ Sorry, I could not retrieve any tweets. Please try again.');
        }
      } catch (error) {
        console.error('Error processing question:', error);
        await this.bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
      }
    });

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
      console.log('🚀 Starting Twitter LeaderBoard Telegram Bot...')
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
