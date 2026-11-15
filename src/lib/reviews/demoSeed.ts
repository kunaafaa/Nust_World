/**
 * Sample content for `?reviews=memory` (demos and e2e tests only; never sent anywhere).
 * Names say "Demo" so nobody mistakes them for real reviews.
 */
import type { MemorySeed } from './memoryStore';

const users = ['demo-a', 'demo-b', 'demo-c', 'demo-d'];

export const DEMO_SEED: MemorySeed = {
  reviews: [
    {
      placeId: 'concordia-1-6900',
      userId: users[0],
      displayName: 'Demo reviewer A',
      rating: 4,
      body: 'Quick service at lunch, the seating fills up after 1 pm.',
    },
    {
      placeId: 'concordia-1-6900',
      userId: users[1],
      displayName: 'Demo reviewer B',
      rating: 5,
      body: 'Good value. <b>Not bold</b>: text is shown exactly as typed.',
    },
  ],
  food: [
    // three ratings: shows a pill
    ...users.slice(0, 3).map((u, i) => ({
      cafeId: 'c1',
      itemKey: 'c1/chicken-tikka-piece',
      userId: u,
      rating: [5, 4, 5][i],
    })),
    ...users.map((u, i) => ({
      cafeId: 'c1',
      itemKey: 'c1/chicken-tikka-boti',
      userId: u,
      rating: [4, 4, 3, 4][i],
    })),
    // two ratings: below the threshold, no pill
    ...users.slice(0, 2).map((u) => ({
      cafeId: 'c1',
      itemKey: 'c1/chicken-achari-boti',
      userId: u,
      rating: 2,
    })),
  ],
};
