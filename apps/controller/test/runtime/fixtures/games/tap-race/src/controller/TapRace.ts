import type { ControllerProps, GameInput } from "@couchcade/game-sdk/contract";
import type { JsonValue } from "@couchcade/protocol";
import { defineComponent, h, type PropType } from "vue";

type Props = ControllerProps<JsonValue, GameInput>;

/** A test-only controller: prints what it was given and sends "tap" when pressed. */
export default defineComponent({
  props: {
    screen: { type: String, required: true },
    data: { type: null as unknown as PropType<JsonValue>, required: true },
    player: { type: Object as PropType<Props["player"]>, required: true },
    send: { type: Function as PropType<Props["send"]>, required: true },
  },
  setup(props) {
    return () =>
      h(
        "button",
        { onPointerdown: (event: PointerEvent) => props.send({ type: "tap" }, event.timeStamp) },
        `${props.player.name} ${props.screen} ${JSON.stringify(props.data)}`,
      );
  },
});
