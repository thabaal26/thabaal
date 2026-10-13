/*
 * Order update templates come in a plain version (order_confirmation, …) and a picture version.
 * Picture versions are named "pic_<name>"; Thenan Oils' were created as "thenan_<name>" before
 * clients had their own picture, and keep those names so nothing they already have changes.
 */

export const ORDER_TEMPLATE_NAMES = ["order_confirmation", "order_dispatched", "order_delivered", "order_cancelled"] as const;

const PICTURE_PREFIXES = ["pic_", "thenan_"] as const;

/** The plain name and every picture-version name for one order template. */
export const orderTemplateNames = (base: string) => [base, ...PICTURE_PREFIXES.map((p) => `${p}${base}`)];

/** Whether a template is the picture version of `base`. */
export const isPictureVersion = (name: string, base: string) => PICTURE_PREFIXES.some((p) => name === `${p}${base}`);

/** The prefix for a client's new picture versions: the one they already use, else "pic_". */
export const picturePrefixFor = (existingNames: string[]) => (existingNames.some((n) => n.startsWith("thenan_order_")) ? "thenan_" : "pic_");

/** WhatsApp image headers must be a public JPG or PNG. */
export const isTemplatePicture = (url: string | null | undefined) => !!url && /^https:\/\/\S+\.(jpe?g|png)(\?\S*)?$/i.test(url.trim());
