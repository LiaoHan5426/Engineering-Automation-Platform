import { defineComponent, h } from "vue";
/** Shared account picture with an icon fallback for missing or unavailable images. */
import { IconUserOutlineMedium } from "@deepseek-ai/dsh-client-ui-primitives";
import type { AccountAvatarSnapshot } from "./account-avatar.ts";
import css from "./AccountAvatar.module.css";
/**
 * Render a decorative avatar next to the account identity.
 * @param props - shared browser load outcome and rendered-image failure reporter; absent data uses the default icon.
 * @returns picture or the default account icon.
 */
export const AccountAvatar = defineComponent(
  (componentProps: {
    avatar: AccountAvatarSnapshot | undefined;
    avatarFailed: (snapshot: AccountAvatarSnapshot) => void;
  }) => {
    return () => {
      const render_prop_avatar = componentProps.avatar;
      const render_prop_avatarFailed = componentProps.avatarFailed;
      return render_prop_avatar?.status === "ready"
        ? h("img", {
            class: css.image,
            src: render_prop_avatar.url,
            alt: "",
            referrerPolicy: "no-referrer",
            onError: () => {
              render_prop_avatarFailed(render_prop_avatar);
            },
          })
        : h(IconUserOutlineMedium, { size: 16 });
    };
  },
  { inheritAttrs: false, props: ["avatar", "avatarFailed"] },
);
