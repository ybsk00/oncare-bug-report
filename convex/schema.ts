import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const platformValidator = v.union(v.literal('iOS'), v.literal('Android'));
export const statusValidator = v.union(
  v.literal('접수'),
  v.literal('확인중'),
  v.literal('수정완료'),
  v.literal('재현불가'),
);

export default defineSchema({
  bugReports: defineTable({
    /** 목록 번호. create 에서 단조 증가로 채번한다. */
    seq: v.number(),
    department: v.string(),
    reporterName: v.string(),
    title: v.string(),
    body: v.string(),
    /** bcrypt 해시. 평문은 어디에도 저장하지 않는다. */
    passwordHash: v.string(),
    /** 최소 1장. 이미지 자체는 Convex 파일 저장소에 있다. */
    imageIds: v.array(v.id('_storage')),
    appVersion: v.optional(v.string()),
    platform: v.optional(platformValidator),
    deviceModel: v.optional(v.string()),
    status: statusValidator,
    adminNote: v.optional(v.string()),
    /** 남용 추적용. 화면에는 절대 내보내지 않는다. */
    createdIp: v.optional(v.string()),
  }).index('by_seq', ['seq']),

  rateLimit: defineTable({
    ip: v.string(),
    action: v.union(v.literal('submit'), v.literal('unlock')),
    at: v.number(), // epoch ms
  }).index('by_ip_action', ['ip', 'action']),
});
