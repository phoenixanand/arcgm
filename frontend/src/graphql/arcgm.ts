import { graphqlRequest } from "./client";

export interface UserStats {
  id: string;
  totalPoints: string;
  gmCount: string;
  streak: string;
  longestStreak: string;
  successfulReferrals: string;
  lastGMTimestamp: string;
}

export async function getUserStats(
  address: string
): Promise<UserStats | null> {
  const query = `
    query GetUser($address: ID!) {
      user(id: $address) {
        id
        totalPoints
        gmCount
        streak
        longestStreak
        successfulReferrals
        lastGMTimestamp
      }
    }
  `;

  const data = await graphqlRequest<{
    user: UserStats | null;
  }>(query, {
    address: address.toLowerCase(),
  });

  return data.user;
}

export async function getUserRank(
  address: string
): Promise<number | null> {
  const query = `
    query GetLeaderboard {
      users(
        first: 1000
        orderBy: totalPoints
        orderDirection: desc
      ) {
        id
        totalPoints
      }
    }
  `;

  const data = await graphqlRequest<{
    users: {
      id: string;
      totalPoints: string;
    }[];
  }>(query);

  const index = data.users.findIndex(
    (user) => user.id.toLowerCase() === address.toLowerCase()
  );

  return index === -1 ? null : index + 1;
}