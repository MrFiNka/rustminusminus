export interface DiscordUser {
  id: string;                    // the user’s id (snowflake)  
  username: string;              // the user’s username, not unique across the platform  
  discriminator: string;         // the user’s 4-digit discord tag  
  global_name?: string | null;   // the user’s display name, if set (for bots this is the application name)  
  avatar?: string | null;        // the user’s avatar hash  
  bot?: boolean;                 // whether the user belongs to an OAuth2 application  
  system?: boolean;              // whether the user is an Official Discord System user  
  mfa_enabled?: boolean;         // whether the user has 2-factor enabled on their account  
  banner?: string | null;        // the user’s banner hash  
  accent_color?: number | null;  // the user’s banner/accent color as integer hex code  
  locale?: string;               // the user’s chosen language option  
  verified?: boolean;            // whether the email on this account has been verified  
  email?: string | null;         // the user’s email (if the `email` OAuth2 scope was requested)  
  flags?: number;                // the flags on a user’s account  
  premium_type?: number;         // the type of Nitro subscription on a user’s account  
  public_flags?: number;         // the public flags on a user’s account  
  avatar_decoration_data?: AvatarDecorationData | null;  // data for the user’s avatar decoration  
  collectibles?: Collectibles | null;                 // the collectibles the user has  
  primary_guild?: UserPrimaryGuild | null;             // the user’s primary guild object  
}

// Supporting types:

export interface AvatarDecorationData {
  asset: string;     // the avatar decoration hash  
  sku_id: string;    // snowflake id of the avatar decoration’s SKU  
}

export interface Collectibles {
  nameplate?: Nameplate | null;  // optional nameplate object  
}

export interface Nameplate {
  sku_id: string;       // snowflake id of the nameplate SKU  
  asset: string;        // path to the nameplate asset  
  label: string;        // the label of this nameplate (currently unused)  
  palette: 'crimson' | 'berry' | 'sky' | 'teal' |
           'forest'  | 'bubble_gum' | 'violet' | 'cobalt' |
           'clover'   | 'lemon'     | 'white';   // background color  
}

export interface UserPrimaryGuild {
  identity_guild_id?: string | null;  // id of the user’s primary guild  
  identity_enabled?: boolean;          // whether the user is displaying the primary guild’s server tag  
  tag?: string | null;                 // the text of the user’s server tag (max 4 chars)  
  badge?: string | null;               // the server tag badge hash  
}

export interface DiscordPartialGuild {
  id: string;               // guild id (snowflake)
  name: string;             // guild name
  icon?: string | null;     // icon hash, or null if none
  owner?: boolean;          // true if the user is the owner of the guild
  permissions?: string;     // permissions bit-field for the user in this guild (as a string)
  features?: string[];      // array of guild features
  // Additional optional fields that may or may not be present
  // e.g. “mutual” flag (some discussion reported this)  
  mutual?: boolean;
  // If ‘with_counts’ parameter is used, approximate counts may be included
  approximate_member_count?: number;
  approximate_presence_count?: number;
}