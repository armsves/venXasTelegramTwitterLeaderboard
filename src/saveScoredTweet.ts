import { supabase } from './supabaseClient';

type ScoredTweet = {
  id_tweet: string;
  user_id: string;
  username: string;
  text: string;
  published_at: string;
  likes: number;
  retweets: number;
  replies: number;
  followers: number;

  score: number;
  impact_score: number;
  freshness_multiplier: number;
  consistency_multiplier: number;
  decay_factor: number;

  index_in_batch: number;
  is_first_of_week: boolean;
  is_second_of_week: boolean;
  user_was_active_last_week: boolean;

  processed_at?: string;
};

export async function saveScoredTweet(tweet: ScoredTweet) {
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
