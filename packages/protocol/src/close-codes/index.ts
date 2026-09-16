/** WebSocket close codes the relay uses. Clients never reconnect after one of these. */
export const closeCodes = {
  /** Kicked by the host. Show "Kicked". */
  kicked: 4003,
  /** Room closed or expired. Show the join screen. */
  roomClosed: 4004,
  /** Sent too many messages. */
  flooding: 4008,
  /** A newer connection for the same player or host took over. The newer tab wins. */
  replaced: 4009,
  /** Rejoined more than 2 minutes after disconnecting. Show the join screen with the code filled in. */
  seatExpired: 4011,
} as const;
export type CloseCode = (typeof closeCodes)[keyof typeof closeCodes];

/** Normal close, deploy, network loss and server restart. Clients reconnect with a fresh ticket. */
export const reconnectCloseCodes = [1000, 1001, 1006, 1011, 1012] as const;
