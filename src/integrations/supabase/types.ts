// Hand-written, permissive Database type for the Admin app.
//
// The Admin app only touches the AI Studio control-plane tables (providers,
// models, workflows, knowledge_bases, user_roles, usage_events, user_quotas,
// activity_events). Those tables are not in Project Navigator's generated
// types yet, so this file stays deliberately loose: rows are `Record<string,
// unknown>` and each server fn casts to the typed interfaces in
// `@/lib/control-plane`.
//
// Once the control-plane migration is applied, replace this file with
// `supabase gen types typescript` output for the full, strict schema.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type GenericRow = Record<string, unknown>;

export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: GenericRow;
        Insert: GenericRow;
        Update: GenericRow;
        Relationships: [];
      }
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
