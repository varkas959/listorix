import { supabase } from './supabase';

export type FeatureIdeaStatus = 'open' | 'planned' | 'in_progress';

export interface FeatureIdea {
  id: string;
  title: string;
  description: string;
  votes: number;
  status: FeatureIdeaStatus;
  createdAt: string;
  source: 'seeded' | 'user';
}

interface DbFeatureIdea {
  id: string;
  title: string;
  description: string | null;
  vote_count: number | null;
  status: FeatureIdeaStatus;
  created_at: string;
  source: 'seeded' | 'user' | null;
}

interface FeatureIdeasState {
  ideas: FeatureIdea[];
  votedIdeaIds: string[];
}

const FEATURE_IDEAS_CACHE_TTL_MS = 30_000;

let cachedIdeasState: FeatureIdeasState | null = null;
let cachedIdeasUserId: string | undefined;
let cachedIdeasAt = 0;

interface ToggleVoteResult {
  idea_id: string;
  vote_count: number;
  voted: boolean;
}

interface SubmitIdeaResult {
  idea_id: string;
  title: string;
  description: string | null;
  vote_count: number;
  status: FeatureIdeaStatus;
  created_at: string;
  source: 'seeded' | 'user' | null;
  merged: boolean;
}

function sortIdeas(ideas: FeatureIdea[]): FeatureIdea[] {
  return [...ideas].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.title.localeCompare(b.title);
  });
}

function mapIdea(row: DbFeatureIdea): FeatureIdea {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    votes: row.vote_count ?? 0,
    status: row.status,
    createdAt: row.created_at,
    source: row.source ?? 'user',
  };
}

async function loadVotedIdeaIds(userId?: string): Promise<string[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('feature_idea_votes')
    .select('idea_id')
    .eq('user_id', userId);

  if (error) {
    console.warn('[featureIdeas] load votes:', error.message);
    return [];
  }

  return (data ?? []).map(row => String(row.idea_id));
}

export async function loadFeatureIdeas(userId?: string): Promise<FeatureIdeasState> {
  const now = Date.now();
  if (
    cachedIdeasState &&
    cachedIdeasUserId === userId &&
    now - cachedIdeasAt < FEATURE_IDEAS_CACHE_TTL_MS
  ) {
    return cachedIdeasState;
  }

  const [ideasResult, votedIdeaIds] = await Promise.all([
    supabase
      .from('feature_ideas')
      .select('id, title, description, vote_count, status, created_at, source')
      .order('vote_count', { ascending: false })
      .order('title', { ascending: true })
      .returns<DbFeatureIdea[]>(),
    loadVotedIdeaIds(userId),
  ]);

  const { data, error } = ideasResult;

  if (error) {
    console.warn('[featureIdeas] load ideas:', error.message);
    return cachedIdeasState ?? { ideas: [], votedIdeaIds: [] };
  }

  const nextState = {
    ideas: sortIdeas((data ?? []).map(mapIdea)),
    votedIdeaIds,
  };
  cachedIdeasState = nextState;
  cachedIdeasUserId = userId;
  cachedIdeasAt = now;
  return nextState;
}

export async function toggleFeatureIdeaVote(
  ideaId: string,
  userId?: string
): Promise<FeatureIdeasState> {
  if (!userId) {
    throw new Error('AUTH_REQUIRED');
  }

  const { data, error } = await supabase
    .rpc('toggle_feature_idea_vote', { p_idea_id: ideaId })
    .single<ToggleVoteResult>();

  if (error || !data) {
    console.warn('[featureIdeas] toggle vote:', error?.message);
    throw new Error(error?.message || 'VOTE_FAILED');
  }

  const state = await loadFeatureIdeas(userId);
  return {
    ideas: state.ideas.map(idea => (
      idea.id === data.idea_id ? { ...idea, votes: data.vote_count } : idea
    )),
    votedIdeaIds: data.voted
      ? Array.from(new Set([...state.votedIdeaIds, data.idea_id]))
      : state.votedIdeaIds.filter(id => id !== data.idea_id),
  };
}

export async function submitFeatureIdea(
  input: { title: string; description?: string },
  userId?: string
): Promise<{ state: FeatureIdeasState; idea: FeatureIdea; merged: boolean }> {
  if (!userId) {
    throw new Error('AUTH_REQUIRED');
  }

  const title = input.title.trim();
  const description = input.description?.trim() ?? '';

  const { data, error } = await supabase
    .rpc('submit_feature_idea', {
      p_title: title,
      p_description: description || null,
    })
    .single<SubmitIdeaResult>();

  if (error || !data) {
    console.warn('[featureIdeas] submit idea:', error?.message);
    throw new Error(error?.message || 'SUBMIT_FAILED');
  }

  const state = await loadFeatureIdeas(userId);
  const idea: FeatureIdea = {
    id: data.idea_id,
    title: data.title,
    description: data.description ?? '',
    votes: data.vote_count,
    status: data.status,
    createdAt: data.created_at,
    source: data.source ?? 'user',
  };

  return {
    state,
    idea,
    merged: data.merged,
  };
}
