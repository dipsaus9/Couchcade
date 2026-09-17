/**
 * The NL + EN name blocklists (docs/architecture/security.md, "Blocklist"). They're public on
 * purpose: a filter for a party, not a secret, and Kick is the backstop for whatever they miss.
 *
 * Every entry is already folded (see `foldName`): lower case a to z with no repeated letters, so
 * "faggot" is stored as "fagot". Folding is why some words are left out: "boob" folds to "bob".
 */
export interface NameBlocklist {
  /** Words that are never part of a normal name. They match anywhere in the folded name. */
  readonly anywhere: readonly string[];
  /** Short words that hide inside ordinary names. They match only the whole folded name. */
  readonly whole: readonly string[];
}

export const EN_NAME_BLOCKLIST: NameBlocklist = {
  anywhere: [
    "ashole",
    "bitch",
    "blowjob",
    "bulshit",
    "cocksucker",
    "cunt",
    "dildo",
    "fagot",
    "fuck",
    "hitler",
    "niger",
    "rapist",
    "retard",
    "trany",
    "wanker",
    "whore",
  ],
  whole: [
    "arse",
    "chink",
    "cock",
    "cum",
    "fag",
    "jiz",
    "kike",
    "nazi",
    "niga",
    "paki",
    "penis",
    "pis",
    "porn",
    "pusy",
    "rape",
    "shit",
    "slut",
    "spic",
    "tits",
    "twat",
    "wank",
  ],
};

export const NL_NAME_BLOCKLIST: NameBlocklist = {
  anywhere: [
    "bosneger",
    "debiel",
    "fliker",
    "hoerenjong",
    "kanker",
    "klotzak",
    "kutwijf",
    "neuken",
    "niker",
    "pedofiel",
    "spast",
    "tyfus",
  ],
  whole: [
    "hoer",
    "homo",
    "kut",
    "lul",
    "mongol",
    "neger",
    "neuk",
    "pedo",
    "pik",
    "slet",
    "tef",
    "tering",
    "trut",
  ],
};
