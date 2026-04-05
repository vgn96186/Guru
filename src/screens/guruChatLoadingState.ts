export function shouldShowGuruChatSkeleton(args: {
  isHydratingThread: boolean;
  isHydratingHistory: boolean;
}) {
  return args.isHydratingThread || args.isHydratingHistory;
}
