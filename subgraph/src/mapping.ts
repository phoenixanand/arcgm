import {
  GMRecorded,
  ReferralSet,
  UserStatsUpdated,
} from "../generated/ArcGM/ArcGM";
 
import {
  User,
  GMRecord,
  Referral,
} from "../generated/schema";
 
import { BigInt } from "@graphprotocol/graph-ts";
 
import { Bytes } from "@graphprotocol/graph-ts";
 
 
function getOrCreateUser(address: Bytes): User {
  let user = User.load(address);
 
  if (user == null) {
    user = new User(address);
 
    user.totalPoints = BigInt.zero();
    user.gmCount = BigInt.zero();
    user.streak = BigInt.zero();
    user.longestStreak = BigInt.zero();
    user.successfulReferrals = BigInt.zero();
    user.lastGMTimestamp = BigInt.zero();
 
    user.save();
  }
 
  return user;
}
 
 
export function handleGMRecorded(event: GMRecorded): void {
  let user = getOrCreateUser(event.params.user);
 
  user.totalPoints = event.params.totalPoints;
  user.gmCount = event.params.gmCount;
  user.streak = event.params.streak;
  user.longestStreak = event.params.longestStreak;
  user.lastGMTimestamp = event.params.timestamp;
 
  user.save();
 
 
  let recordId = event.transaction.hash.concatI32(
    event.logIndex.toI32()
  );
 
  let record = new GMRecord(recordId);
 
  record.user = user.id;
  record.timestamp = event.params.timestamp;
  record.streak = event.params.streak;
  record.pointsAwarded = event.params.pointsAwarded;
  record.gmCount = event.params.gmCount;
  record.totalPoints = event.params.totalPoints;
  record.longestStreak = event.params.longestStreak;
  record.referrer = event.params.referrer;
 
  record.save();
}
 
 
export function handleReferralSet(event: ReferralSet): void {
  let id = event.transaction.hash.concatI32(
    event.logIndex.toI32()
  );
 
  let referral = new Referral(id);
 
  referral.referred = event.params.referred;
  referral.referrer = event.params.referrer;
  referral.timestamp = event.block.timestamp;
 
  referral.save();
}
 
 
export function handleUserStatsUpdated(
  event: UserStatsUpdated
): void {
  let user = getOrCreateUser(event.params.user);
 
  user.totalPoints = event.params.totalPoints;
  user.gmCount = event.params.gmCount;
  user.streak = event.params.streak;
  user.longestStreak = event.params.longestStreak;
  user.successfulReferrals = event.params.successfulReferrals;
  user.lastGMTimestamp = event.params.timestamp;
 
  user.save();
}
