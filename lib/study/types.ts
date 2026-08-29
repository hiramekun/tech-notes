export type ReviewRating = 1 | 2 | 3 | 4;

/** 左スワイプ = 覚えていない(Again) / 右スワイプ = 覚えている(Good) */
export const SWIPE_RATING = { left: 1, right: 3 } as const satisfies Record<string, ReviewRating>;

export interface QueueCard {
  cardId: string;
  noteId: string;
  kind: string;
  front: string;
  title: string;
  category: string;
  state: string;
  due: number;
  mastery: number;
  retrievability: number;
  isNew: boolean;
}

export interface Counts {
  new: number;
  review: number;
}

export interface QueueResponse {
  studyDay: string;
  done: Counts;
  remaining: Counts;
  cards: QueueCard[];
}

export interface PendingReview {
  clientEventId: string;
  cardId: string;
  rating: ReviewRating;
  reviewedAt: number;
  durationMs?: number;
}

export interface ReviewsResponse {
  studyDay: string;
  applied: { cardId: string; state: string; due: number; mastery: number }[];
  skipped: string[];
  done: Counts;
  remaining: Counts;
}
