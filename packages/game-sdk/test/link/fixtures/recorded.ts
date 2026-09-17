/**
 * Recorded offer/answer session descriptions, one pair per engine, captured with
 * `iceServers: []` and negotiated `cc-stream`/`cc-events` data channels (implementation notes,
 * CC-3.16): `pc.createOffer()` / `pc.createAnswer()`, then `pc.localDescription.sdp` once
 * `iceGatheringState` is `"complete"`.
 *
 * Captured from Playwright Chromium and WebKit, and a local Firefox, all on this machine. WebKit
 * gathered zero candidates in this headless sandbox (no route to enumerate a local interface) and
 * never left `iceGatheringState: "gathering"`; that SDP is still a real, valid WebKit description
 * with `ice-ufrag`, `ice-pwd` and a fingerprint, so it stays as the Safari fixture and exercises
 * the codec's empty-candidate-list path. `description.test.ts` covers the 6-candidate truncation
 * and the UDP/host filter with synthetic SDP instead, since none of these three live captures
 * happened to offer more than one candidate.
 */

export interface RecordedPair {
  readonly offerSdp: string;
  readonly answerSdp: string;
}

export const chrome: RecordedPair = {
  offerSdp:
    "v=0\r\no=- 1221070544939121962 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:2283994475 1 udp 2113937151 f692ad69-9e69-4aac-aaaa-41175088c4db.local 55638 typ host generation 0 network-cost 999\r\na=ice-ufrag:kSKC\r\na=ice-pwd:Cx9f8u09OBWsm/GmyF6uhBXW\r\na=ice-options:trickle\r\na=fingerprint:sha-256 D8:49:B7:E3:7E:A1:99:EF:D1:58:9E:25:5F:30:FB:F7:CE:BA:2F:C1:2A:E3:BA:DC:04:1A:BE:54:E5:56:5C:34\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n",
  answerSdp:
    "v=0\r\no=- 1987209511944174545 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:1403981490 1 udp 2113937151 f692ad69-9e69-4aac-aaaa-41175088c4db.local 64550 typ host generation 0 network-cost 999\r\na=ice-ufrag:naCg\r\na=ice-pwd:bIc9uq/lNp29uaLD1r9j1WVJ\r\na=ice-options:trickle\r\na=fingerprint:sha-256 83:12:9B:E3:DE:63:29:2D:49:EA:1D:4E:39:7A:DD:5C:C6:8B:D0:88:AB:D1:CF:DD:60:14:33:1A:B6:D6:88:8D\r\na=setup:active\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n",
};

export const firefox: RecordedPair = {
  offerSdp:
    "v=0\r\no=mozilla...THIS_IS_SDPARTA-99.0 7052682934789621142 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\na=sendrecv\r\na=fingerprint:sha-256 EB:E5:D9:72:FC:70:6A:3D:7B:46:20:66:AA:B4:15:E8:E3:21:F8:03:62:D9:B0:44:7A:81:34:1B:10:BB:8D:BF\r\na=group:BUNDLE 0\r\na=ice-options:trickle\r\na=msid-semantic:WMS *\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:0 1 UDP 2122252543 5b316eee-6180-47c4-a702-b25bf2d9b2e0.local 60557 typ host\r\na=candidate:1 1 TCP 2105524479 5b316eee-6180-47c4-a702-b25bf2d9b2e0.local 9 typ host tcptype active\r\na=sendrecv\r\na=end-of-candidates\r\na=ice-pwd:8e2b4af881ad3fc4fdb79bc525962509\r\na=ice-ufrag:d62b5554\r\na=mid:0\r\na=setup:actpass\r\na=sctp-port:5000\r\na=max-message-size:1073741823\r\n",
  answerSdp:
    "v=0\r\no=mozilla...THIS_IS_SDPARTA-99.0 5475752779065101452 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\na=sendrecv\r\na=fingerprint:sha-256 F9:05:D1:44:4D:B7:24:70:E6:31:36:F6:A0:0C:D9:80:42:E2:9C:52:2D:4B:77:14:E5:D9:D9:8E:58:C7:8B:8F\r\na=group:BUNDLE 0\r\na=ice-options:trickle\r\na=msid-semantic:WMS *\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:0 1 UDP 2122252543 e306b6bf-bb1c-48e8-a895-4f72e0673ed5.local 51408 typ host\r\na=candidate:1 1 TCP 2105524479 e306b6bf-bb1c-48e8-a895-4f72e0673ed5.local 9 typ host tcptype active\r\na=sendrecv\r\na=end-of-candidates\r\na=ice-pwd:332d93f298b1542e4dfe0f52f675429a\r\na=ice-ufrag:27549d4d\r\na=mid:0\r\na=setup:active\r\na=sctp-port:5000\r\na=max-message-size:1073741823\r\n",
};

/**
 * WebKit (Safari's engine): valid `ice-ufrag`/`ice-pwd`/fingerprint, zero candidates. See the
 * module doc for why.
 */
export const safari: RecordedPair = {
  offerSdp:
    "v=0\r\no=- 2629914744191032576 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:nolW\r\na=ice-pwd:Tk/XkwwNDT+kqlMxZSqFUSJP\r\na=ice-options:trickle\r\na=fingerprint:sha-256 9C:2D:CF:AB:2C:BC:AA:F6:4A:AB:51:64:95:34:A8:D3:57:4F:7A:BD:69:EF:35:7E:E2:BA:D7:18:EF:A0:8D:74\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n",
  answerSdp:
    "v=0\r\no=- 315912852872068496 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=ice-ufrag:q6k4\r\na=ice-pwd:cNsJFRiOE+z+WjRybWvRZEas\r\na=ice-options:trickle\r\na=fingerprint:sha-256 7E:F0:26:84:07:F8:7A:D1:68:9E:E3:7C:32:46:1F:2E:72:3C:08:24:49:CD:23:B8:4D:EA:B3:94:72:D0:94:80\r\na=setup:active\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n",
};

export const recorded: Readonly<Record<"chrome" | "firefox" | "safari", RecordedPair>> = {
  chrome,
  firefox,
  safari,
};
