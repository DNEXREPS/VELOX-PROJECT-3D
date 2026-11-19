export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bicycle_build_revisions: {
        Row: {
          bicycle_id: string;
          build_id: string;
          changes: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          new_configuration: NonNullable<Json>;
          previous_configuration: NonNullable<Json>;
          revision_number: number;
        };
        ComputedFields: never;
        Insert: {
          bicycle_id: string;
          build_id: string;
          changes: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          new_configuration: NonNullable<Json>;
          previous_configuration: NonNullable<Json>;
          revision_number: number;
        };
        Update: {
          bicycle_id?: string;
          build_id?: string;
          changes?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          new_configuration?: NonNullable<Json>;
          previous_configuration?: NonNullable<Json>;
          revision_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bicycle_build_revisions_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_build_revisions_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_build_revisions_build_id_fkey";
            columns: ["build_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_builds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_build_revisions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "bicycle_build_revisions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_build_revisions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bicycle_builds: {
        Row: {
          bicycle_id: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bicycle_id: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Update: {
          bicycle_id?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bicycle_builds_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_builds_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
        ];
      };
      bicycle_components: {
        Row: {
          bicycle_id: string;
          component_id: string | null;
          created_at: string;
          currency: string | null;
          custom_name: string | null;
          id: string;
          installed_on: string | null;
          notes: string | null;
          price_paid: number | null;
          slot: Database["public"]["Enums"]["bike_slot"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bicycle_id: string;
          component_id?: string | null;
          created_at?: string;
          currency?: string | null;
          custom_name?: string | null;
          id?: string;
          installed_on?: string | null;
          notes?: string | null;
          price_paid?: number | null;
          slot: Database["public"]["Enums"]["bike_slot"];
          updated_at?: string;
        };
        Update: {
          bicycle_id?: string;
          component_id?: string | null;
          created_at?: string;
          currency?: string | null;
          custom_name?: string | null;
          id?: string;
          installed_on?: string | null;
          notes?: string | null;
          price_paid?: number | null;
          slot?: Database["public"]["Enums"]["bike_slot"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bicycle_components_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_components_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_components_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "component_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_components_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
        ];
      };
      bicycle_images: {
        Row: {
          bicycle_id: string;
          caption: string | null;
          created_at: string;
          height: number | null;
          id: string;
          owner_id: string;
          sort_order: number;
          storage_path: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          bicycle_id: string;
          caption?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          owner_id: string;
          sort_order?: number;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          bicycle_id?: string;
          caption?: string | null;
          created_at?: string;
          height?: number | null;
          id?: string;
          owner_id?: string;
          sort_order?: number;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "bicycle_images_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_images_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_images_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "bicycle_images_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_images_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bicycle_private_details: {
        Row: {
          bicycle_id: string;
          created_at: string;
          owner_id: string;
          private_notes: string | null;
          purchase_currency: string;
          purchase_date: string | null;
          purchase_price: number | null;
          serial_number: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bicycle_id: string;
          created_at?: string;
          owner_id: string;
          private_notes?: string | null;
          purchase_currency?: string;
          purchase_date?: string | null;
          purchase_price?: number | null;
          serial_number?: string | null;
          updated_at?: string;
        };
        Update: {
          bicycle_id?: string;
          created_at?: string;
          owner_id?: string;
          private_notes?: string | null;
          purchase_currency?: string;
          purchase_date?: string | null;
          purchase_price?: number | null;
          serial_number?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bicycle_private_details_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: true;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_private_details_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: true;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_private_details_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "bicycle_private_details_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_private_details_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bicycles: {
        Row: {
          brand: string | null;
          category: Database["public"]["Enums"]["bicycle_category"];
          color: string | null;
          color_hex: string | null;
          cover_image_path: string | null;
          created_at: string;
          description: string | null;
          estimated_value: number | null;
          frame_material: Database["public"]["Enums"]["frame_material"] | null;
          frame_size: string | null;
          id: string;
          is_primary: boolean;
          last_accessed_at: string | null;
          model: string | null;
          model_key: string;
          model_year: number | null;
          name: string;
          owner_id: string;
          passport_show_components: boolean;
          passport_show_history: boolean;
          passport_show_maintenance: boolean;
          passport_show_value: boolean;
          passport_show_weight: boolean;
          slug: string;
          updated_at: string;
          value_currency: string;
          visibility: Database["public"]["Enums"]["bicycle_visibility"];
          weight_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          brand?: string | null;
          category?: Database["public"]["Enums"]["bicycle_category"];
          color?: string | null;
          color_hex?: string | null;
          cover_image_path?: string | null;
          created_at?: string;
          description?: string | null;
          estimated_value?: number | null;
          frame_material?: Database["public"]["Enums"]["frame_material"] | null;
          frame_size?: string | null;
          id?: string;
          is_primary?: boolean;
          last_accessed_at?: string | null;
          model?: string | null;
          model_key?: string;
          model_year?: number | null;
          name: string;
          owner_id: string;
          passport_show_components?: boolean;
          passport_show_history?: boolean;
          passport_show_maintenance?: boolean;
          passport_show_value?: boolean;
          passport_show_weight?: boolean;
          slug: string;
          updated_at?: string;
          value_currency?: string;
          visibility?: Database["public"]["Enums"]["bicycle_visibility"];
          weight_kg?: number | null;
        };
        Update: {
          brand?: string | null;
          category?: Database["public"]["Enums"]["bicycle_category"];
          color?: string | null;
          color_hex?: string | null;
          cover_image_path?: string | null;
          created_at?: string;
          description?: string | null;
          estimated_value?: number | null;
          frame_material?: Database["public"]["Enums"]["frame_material"] | null;
          frame_size?: string | null;
          id?: string;
          is_primary?: boolean;
          last_accessed_at?: string | null;
          model?: string | null;
          model_key?: string;
          model_year?: number | null;
          name?: string;
          owner_id?: string;
          passport_show_components?: boolean;
          passport_show_history?: boolean;
          passport_show_maintenance?: boolean;
          passport_show_value?: boolean;
          passport_show_weight?: boolean;
          slug?: string;
          updated_at?: string;
          value_currency?: string;
          visibility?: Database["public"]["Enums"]["bicycle_visibility"];
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "bicycles_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "bicycles_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycles_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookmarks: {
        Row: {
          bicycle_id: string;
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          bicycle_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          bicycle_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmarks_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmarks_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_posts: {
        Row: {
          author_id: string;
          bicycle_id: string | null;
          body: string;
          created_at: string;
          id: string;
          is_featured: boolean;
          status: Database["public"]["Enums"]["content_status"];
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          bicycle_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          is_featured?: boolean;
          status?: Database["public"]["Enums"]["content_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          bicycle_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          is_featured?: boolean;
          status?: Database["public"]["Enums"]["content_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "community_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_posts_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_posts_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
        ];
      };
      component_brands: {
        Row: {
          country: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_demo: boolean;
          name: string;
          slug: string;
          website_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          name: string;
          slug: string;
          website_url?: string | null;
        };
        Update: {
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          name?: string;
          slug?: string;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "component_brands_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "component_brands_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "component_brands_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      component_categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          slots: Database["public"]["Enums"]["bike_slot"][];
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          slots?: Database["public"]["Enums"]["bike_slot"][];
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          slots?: Database["public"]["Enums"]["bike_slot"][];
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      component_compatibility_rules: {
        Row: {
          attribute: string;
          component_id: string;
          created_at: string;
          id: string;
          notes: string | null;
          source: Database["public"]["Enums"]["data_source"];
          unit: string | null;
          value_list: string[] | null;
          value_numeric: number | null;
          value_text: string | null;
        };
        ComputedFields: never;
        Insert: {
          attribute: string;
          component_id: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          source?: Database["public"]["Enums"]["data_source"];
          unit?: string | null;
          value_list?: string[] | null;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Update: {
          attribute?: string;
          component_id?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          source?: Database["public"]["Enums"]["data_source"];
          unit?: string | null;
          value_list?: string[] | null;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "component_compatibility_rules_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "component_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "component_compatibility_rules_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
        ];
      };
      component_images: {
        Row: {
          alt: string | null;
          component_id: string;
          created_at: string;
          id: string;
          sort_order: number;
          url: string;
        };
        ComputedFields: never;
        Insert: {
          alt?: string | null;
          component_id: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          url: string;
        };
        Update: {
          alt?: string | null;
          component_id?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "component_images_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "component_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "component_images_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
        ];
      };
      component_specifications: {
        Row: {
          component_id: string;
          created_at: string;
          id: string;
          label: string;
          sort_order: number;
          source: Database["public"]["Enums"]["data_source"];
          spec_key: string;
          unit: string | null;
          value_numeric: number | null;
          value_text: string | null;
        };
        ComputedFields: never;
        Insert: {
          component_id: string;
          created_at?: string;
          id?: string;
          label: string;
          sort_order?: number;
          source?: Database["public"]["Enums"]["data_source"];
          spec_key: string;
          unit?: string | null;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Update: {
          component_id?: string;
          created_at?: string;
          id?: string;
          label?: string;
          sort_order?: number;
          source?: Database["public"]["Enums"]["data_source"];
          spec_key?: string;
          unit?: string | null;
          value_numeric?: number | null;
          value_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "component_specifications_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "component_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "component_specifications_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
        ];
      };
      components: {
        Row: {
          brand_id: string;
          category_id: string;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          description: string | null;
          id: string;
          is_demo: boolean | null;
          manufacturer_ref: string | null;
          material: string | null;
          model: string | null;
          name: string;
          price_reference: number | null;
          slug: string;
          source_url: string | null;
          updated_at: string;
          verification_status: Database["public"]["Enums"]["component_verification"];
          weight_g: number | null;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          category_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          description?: string | null;
          id?: string;
          is_demo?: never;
          manufacturer_ref?: string | null;
          material?: string | null;
          model?: string | null;
          name: string;
          price_reference?: number | null;
          slug: string;
          source_url?: string | null;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["component_verification"];
          weight_g?: number | null;
        };
        Update: {
          brand_id?: string;
          category_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          description?: string | null;
          id?: string;
          is_demo?: never;
          manufacturer_ref?: string | null;
          material?: string | null;
          model?: string | null;
          name?: string;
          price_reference?: number | null;
          slug?: string;
          source_url?: string | null;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["component_verification"];
          weight_g?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "components_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "component_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "components_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "component_catalog";
            referencedColumns: ["brand_id"];
          },
          {
            foreignKeyName: "components_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "component_catalog";
            referencedColumns: ["category_id"];
          },
          {
            foreignKeyName: "components_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "component_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "components_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "components_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "components_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["report_status"];
          target_id: string;
          target_type: Database["public"]["Enums"]["report_target"];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reporter_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_id: string;
          target_type: Database["public"]["Enums"]["report_target"];
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reporter_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["report_status"];
          target_id?: string;
          target_type?: Database["public"]["Enums"]["report_target"];
        };
        Relationships: [
          {
            foreignKeyName: "content_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "content_reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      maintenance_photos: {
        Row: {
          created_at: string;
          id: string;
          owner_id: string;
          record_id: string;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          owner_id: string;
          record_id: string;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          owner_id?: string;
          record_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_photos_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "maintenance_photos_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_photos_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_photos_record_id_fkey";
            columns: ["record_id"];
            isOneToOne: false;
            referencedRelation: "maintenance_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_photos_record_id_fkey";
            columns: ["record_id"];
            isOneToOne: false;
            referencedRelation: "passport_maintenance";
            referencedColumns: ["id"];
          },
        ];
      };
      maintenance_records: {
        Row: {
          bicycle_component_id: string | null;
          bicycle_id: string;
          cost: number | null;
          created_at: string;
          currency: string | null;
          distance_km: number | null;
          id: string;
          maintenance_type: Database["public"]["Enums"]["maintenance_type"];
          next_due_distance_km: number | null;
          next_due_on: string | null;
          notes: string | null;
          owner_id: string;
          performed_on: string;
          slot: Database["public"]["Enums"]["bike_slot"] | null;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          bicycle_component_id?: string | null;
          bicycle_id: string;
          cost?: number | null;
          created_at?: string;
          currency?: string | null;
          distance_km?: number | null;
          id?: string;
          maintenance_type: Database["public"]["Enums"]["maintenance_type"];
          next_due_distance_km?: number | null;
          next_due_on?: string | null;
          notes?: string | null;
          owner_id: string;
          performed_on: string;
          slot?: Database["public"]["Enums"]["bike_slot"] | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          bicycle_component_id?: string | null;
          bicycle_id?: string;
          cost?: number | null;
          created_at?: string;
          currency?: string | null;
          distance_km?: number | null;
          id?: string;
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"];
          next_due_distance_km?: number | null;
          next_due_on?: string | null;
          notes?: string | null;
          owner_id?: string;
          performed_on?: string;
          slot?: Database["public"]["Enums"]["bike_slot"] | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_records_bicycle_component_id_fkey";
            columns: ["bicycle_component_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_records_bicycle_component_id_fkey";
            columns: ["bicycle_component_id"];
            isOneToOne: false;
            referencedRelation: "passport_components";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_records_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_records_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_records_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "maintenance_records_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_records_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          post_id: string;
          status: Database["public"]["Enums"]["content_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          post_id: string;
          status?: Database["public"]["Enums"]["content_status"];
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          post_id?: string;
          status?: Database["public"]["Enums"]["content_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "post_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_feed";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_likes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_feed";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "post_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          location: string | null;
          role: Database["public"]["Enums"]["profile_role"];
          updated_at: string;
          username: string;
          website_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          location?: string | null;
          role?: Database["public"]["Enums"]["profile_role"];
          updated_at?: string;
          username: string;
          website_url?: string | null;
        };
        Update: {
          avatar_path?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          location?: string | null;
          role?: Database["public"]["Enums"]["profile_role"];
          updated_at?: string;
          username?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      user_follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "user_follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "user_follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      bicycle_passports: {
        Row: {
          bookmark_count: number | null;
          bookmarked_by_me: boolean | null;
          brand: string | null;
          category: Database["public"]["Enums"]["bicycle_category"];
          color: string | null;
          color_hex: string | null;
          component_count: number | null;
          cover_image_path: string | null;
          created_at: string;
          description: string | null;
          estimated_value: number | null;
          frame_material: Database["public"]["Enums"]["frame_material"] | null;
          frame_size: string | null;
          id: string;
          model: string | null;
          model_key: string;
          model_year: number | null;
          name: string;
          owner_avatar_path: string | null;
          owner_display_name: string | null;
          owner_id: string;
          owner_username: string;
          show_components: boolean;
          show_history: boolean;
          show_maintenance: boolean;
          show_value: boolean;
          show_weight: boolean;
          slug: string;
          updated_at: string;
          value_currency: string | null;
          weight_kg: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      community_feed: {
        Row: {
          author_avatar_path: string | null;
          author_display_name: string | null;
          author_id: string;
          author_username: string;
          bicycle_brand: string | null;
          bicycle_category: Database["public"]["Enums"]["bicycle_category"] | null;
          bicycle_cover_image_path: string | null;
          bicycle_id: string | null;
          bicycle_name: string | null;
          bicycle_slug: string | null;
          body: string;
          comment_count: number | null;
          created_at: string;
          id: string;
          is_featured: boolean;
          like_count: number | null;
          liked_by_me: boolean | null;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "community_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      component_catalog: {
        Row: {
          brand_id: string;
          brand_name: string;
          brand_slug: string;
          category_id: string;
          category_name: string;
          category_slots: Database["public"]["Enums"]["bike_slot"][];
          category_slug: string;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          description: string | null;
          id: string;
          is_demo: boolean | null;
          manufacturer_ref: string | null;
          material: string | null;
          model: string | null;
          name: string;
          price_reference: number | null;
          slug: string;
          source_url: string | null;
          updated_at: string;
          verification_status: Database["public"]["Enums"]["component_verification"];
          weight_g: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "components_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["owner_id"];
          },
          {
            foreignKeyName: "components_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profile_stats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "components_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_components: {
        Row: {
          bicycle_id: string;
          brand_name: string | null;
          category_name: string | null;
          category_slug: string | null;
          component_id: string | null;
          component_slug: string | null;
          currency: string | null;
          id: string;
          installed_on: string | null;
          material: string | null;
          model: string | null;
          name: string | null;
          price_paid: number | null;
          price_reference: number | null;
          slot: Database["public"]["Enums"]["bike_slot"];
          verification_status: Database["public"]["Enums"]["component_verification"] | null;
          weight_g: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "bicycle_components_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_components_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_components_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "component_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_components_component_id_fkey";
            columns: ["component_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_maintenance: {
        Row: {
          bicycle_id: string;
          cost: number | null;
          currency: string | null;
          distance_km: number | null;
          id: string;
          maintenance_type: Database["public"]["Enums"]["maintenance_type"];
          performed_on: string;
          slot: Database["public"]["Enums"]["bike_slot"] | null;
          title: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "maintenance_records_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_records_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_revisions: {
        Row: {
          bicycle_id: string;
          changes: Json | null;
          created_at: string;
          description: string | null;
          id: string;
          revision_number: number;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "bicycle_build_revisions_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycle_passports";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bicycle_build_revisions_bicycle_id_fkey";
            columns: ["bicycle_id"];
            isOneToOne: false;
            referencedRelation: "bicycles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_stats: {
        Row: {
          followed_by_me: boolean | null;
          follower_count: number | null;
          following_count: number | null;
          id: string;
          post_count: number | null;
          public_bicycle_count: number | null;
          username: string;
        };
        ComputedFields: never;
        Insert: {
          followed_by_me?: never;
          follower_count?: never;
          following_count?: never;
          id?: string | null;
          post_count?: never;
          public_bicycle_count?: never;
          username?: string | null;
        };
        Update: {
          followed_by_me?: never;
          follower_count?: never;
          following_count?: never;
          id?: string | null;
          post_count?: never;
          public_bicycle_count?: never;
          username?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      claim_storage_cleanup_jobs: {
        Args: { p_limit?: number };
        Returns: { attempts: number; bucket: string; id: number; object_path: string | null; prefix: string | null }[];
      };
      finish_storage_cleanup_job: {
        Args: { p_error?: string | null; p_id: number };
        Returns: string;
      };
      request_storage_cleanup: {
        Args: { p_bucket: string; p_path: string };
        Returns: undefined;
      };
      retry_failed_storage_cleanup: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      apply_bicycle_configuration: {
        Args: { p_bicycle_id: string; p_changes: Json; p_description?: string };
        Returns: {
          bicycle_id: string;
          build_id: string;
          changes: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          new_configuration: NonNullable<Json>;
          previous_configuration: NonNullable<Json>;
          revision_number: number;
        };
        SetofOptions: {
          from: "*";
          to: "bicycle_build_revisions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      bicycle_configuration_snapshot: { Args: { p_bicycle_id: string }; Returns: Json };
      bicycle_is_public: { Args: { p_bicycle_id: string }; Returns: boolean };
      bicycle_passport_flag: { Args: { p_bicycle_id: string; p_flag: string }; Returns: boolean };
      can_edit_component: { Args: { p_component_id: string }; Returns: boolean };
      current_profile_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["profile_role"];
      };
      diff_configurations: { Args: { p_next: Json; p_prev: Json }; Returns: Json };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_moderator: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_username_available: { Args: { p_username: string }; Returns: boolean };
      moderate_content: {
        Args: {
          p_status: Database["public"]["Enums"]["content_status"];
          p_target_id: string;
          p_target_type: Database["public"]["Enums"]["report_target"];
        };
        Returns: undefined;
      };
      owns_bicycle: { Args: { p_bicycle_id: string }; Returns: boolean };
      post_is_visible: { Args: { p_post_id: string }; Returns: boolean };
      resolve_report: {
        Args: {
          p_note?: string;
          p_report_id: string;
          p_status: Database["public"]["Enums"]["report_status"];
        };
        Returns: undefined;
      };
      set_post_featured: { Args: { p_featured: boolean; p_post_id: string }; Returns: undefined };
      set_primary_bicycle: { Args: { p_bicycle_id: string }; Returns: undefined };
      touch_bicycle: { Args: { p_bicycle_id: string }; Returns: undefined };
      try_uuid: { Args: { p_value: string }; Returns: string };
    };
    Enums: {
      bicycle_category:
        | "road"
        | "gravel"
        | "mountain"
        | "cyclocross"
        | "time_trial"
        | "track"
        | "touring"
        | "city"
        | "bmx"
        | "ebike"
        | "other";
      bicycle_visibility: "private" | "public";
      bike_slot:
        | "frame"
        | "fork"
        | "headset"
        | "stem"
        | "handlebar"
        | "bar_tape"
        | "shifters"
        | "front_brake"
        | "rear_brake"
        | "front_rotor"
        | "rear_rotor"
        | "wheelset"
        | "front_tire"
        | "rear_tire"
        | "tubes"
        | "crankset"
        | "bottom_bracket"
        | "chain"
        | "cassette"
        | "front_derailleur"
        | "rear_derailleur"
        | "saddle"
        | "seatpost"
        | "pedals"
        | "groupset"
        | "accessory_1"
        | "accessory_2"
        | "accessory_3";
      component_verification:
        | "demo"
        | "user_submitted"
        | "community_verified"
        | "manufacturer_verified";
      content_status: "published" | "hidden" | "removed";
      data_source: "manufacturer" | "community" | "user" | "demo";
      frame_material: "carbon" | "aluminium" | "steel" | "titanium" | "other";
      maintenance_type:
        | "inspection"
        | "cleaning"
        | "lubrication"
        | "adjustment"
        | "repair"
        | "replacement"
        | "installation"
        | "brake_bleed"
        | "tubeless_sealant"
        | "wheel_true"
        | "bearing_service"
        | "suspension_service"
        | "other";
      profile_role: "user" | "moderator" | "admin";
      report_reason:
        | "spam"
        | "harassment"
        | "inappropriate"
        | "misleading"
        | "stolen_property"
        | "other";
      report_status: "open" | "reviewing" | "resolved" | "dismissed";
      report_target: "post" | "comment" | "bicycle" | "profile";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      bicycle_category: [
        "road",
        "gravel",
        "mountain",
        "cyclocross",
        "time_trial",
        "track",
        "touring",
        "city",
        "bmx",
        "ebike",
        "other",
      ],
      bicycle_visibility: ["private", "public"],
      bike_slot: [
        "frame",
        "fork",
        "headset",
        "stem",
        "handlebar",
        "bar_tape",
        "shifters",
        "front_brake",
        "rear_brake",
        "front_rotor",
        "rear_rotor",
        "wheelset",
        "front_tire",
        "rear_tire",
        "tubes",
        "crankset",
        "bottom_bracket",
        "chain",
        "cassette",
        "front_derailleur",
        "rear_derailleur",
        "saddle",
        "seatpost",
        "pedals",
        "groupset",
        "accessory_1",
        "accessory_2",
        "accessory_3",
      ],
      component_verification: [
        "demo",
        "user_submitted",
        "community_verified",
        "manufacturer_verified",
      ],
      content_status: ["published", "hidden", "removed"],
      data_source: ["manufacturer", "community", "user", "demo"],
      frame_material: ["carbon", "aluminium", "steel", "titanium", "other"],
      maintenance_type: [
        "inspection",
        "cleaning",
        "lubrication",
        "adjustment",
        "repair",
        "replacement",
        "installation",
        "brake_bleed",
        "tubeless_sealant",
        "wheel_true",
        "bearing_service",
        "suspension_service",
        "other",
      ],
      profile_role: ["user", "moderator", "admin"],
      report_reason: [
        "spam",
        "harassment",
        "inappropriate",
        "misleading",
        "stolen_property",
        "other",
      ],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      report_target: ["post", "comment", "bicycle", "profile"],
    },
  },
} as const;
