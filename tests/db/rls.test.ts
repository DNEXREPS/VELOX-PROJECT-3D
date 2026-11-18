/**
 * Row Level Security, ownership and integrity tests against the real migrations.
 *
 *   scripts/db-local.sh start            # prints DATABASE_URL
 *   DATABASE_URL=postgresql://… npm run test:db
 *
 * Each test runs inside a transaction that is rolled back, impersonating the
 * `anon` / `authenticated` roles exactly as PostgREST does (role + JWT sub claim).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

const ALICE = "a0000000-0000-4000-8000-00000000000a";
const BOB = "b0000000-0000-4000-8000-00000000000b";
const MOD = "c0000000-0000-4000-8000-00000000000c";

let pool: pg.Pool;

type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;

/** Run fn as a given identity inside a rolled-back transaction. */
async function as(user: string | null, fn: (q: Q) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${user ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? ""]);
    let sp = 0;
    const q: Q = async (sql, params) => {
      const name = `sp${sp++}`;
      await client.query(`savepoint ${name}`);
      try {
        const r = await client.query(sql, params);
        await client.query(`release savepoint ${name}`);
        return r;
      } catch (e) {
        await client.query(`rollback to savepoint ${name}`);
        throw e;
      }
    };
    await fn(q);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

/** Run as superuser (setup), committed. */
async function admin(sql: string, params?: unknown[]) {
  return pool.query(sql, params);
}

async function denied(p: Promise<unknown>, pattern: RegExp = /permission denied|row-level security|not allowed|violates|insufficient|immutable|must|moderator/i) {
  await expect(p).rejects.toThrow(pattern);
}

const componentId = async (slug: string) => (await admin("select id from components where slug = $1", [slug])).rows[0].id as string;

let alicePublicBike: string;
let alicePrivateBike: string;
let bobPublicBike: string;

d("RLS & ownership", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await admin("delete from auth.users where id in ($1, $2, $3)", [ALICE, BOB, MOD]);
    await admin(
      `insert into auth.users (id, email, raw_user_meta_data) values
        ($1, 'alice@test.local', '{"username":"alice_t"}'),
        ($2, 'bob@test.local', '{"username":"bob_t"}'),
        ($3, 'mod@test.local', '{"username":"mod_t"}')`,
      [ALICE, BOB, MOD],
    );
    await admin("update profiles set role = 'moderator' where id = $1", [MOD]);
    const mk = async (owner: string, slug: string, visibility: string, extra = "") =>
      (
        await admin(
          `insert into bicycles (owner_id, slug, name, visibility, estimated_value, weight_kg ${extra ? ", passport_show_value" : ""})
           values ($1, $2, $2, $3, 4200, 8.1 ${extra ? ", true" : ""}) returning id`,
          [owner, slug, visibility],
        )
      ).rows[0].id as string;
    alicePublicBike = await mk(ALICE, "alice-public", "public");
    alicePrivateBike = await mk(ALICE, "alice-private", "private");
    bobPublicBike = await mk(BOB, "bob-public", "public", "value");
    await admin("insert into bicycle_private_details (bicycle_id, owner_id, serial_number, purchase_price) values ($1, $2, 'WTU-SECRET-1', 3999)", [alicePublicBike, ALICE]);
  });

  afterAll(async () => {
    await admin("delete from auth.users where id in ($1, $2, $3)", [ALICE, BOB, MOD]);
    await pool.end();
  });

  describe("profiles", () => {
    it("are publicly readable", () =>
      as(null, async (q) => {
        const r = await q("select username from profiles where id = $1", [ALICE]);
        expect(r.rows[0].username).toBe("alice_t");
      }));

    it("can only be edited by their owner, and never the role column", () =>
      as(ALICE, async (q) => {
        await q("update profiles set display_name = 'Alice' where id = $1", [ALICE]);
        const other = await q("update profiles set display_name = 'Hacked' where id = $1", [BOB]);
        expect(other.rowCount).toBe(0);
        await denied(q("update profiles set role = 'admin' where id = $1", [ALICE]));
      }));

    it("username availability helper respects format and uniqueness", () =>
      as(null, async (q) => {
        expect((await q("select is_username_available('alice_t') v")).rows[0].v).toBe(false);
        expect((await q("select is_username_available('Not Valid') v")).rows[0].v).toBe(false);
        expect((await q("select is_username_available('fresh_name') v")).rows[0].v).toBe(true);
      }));
  });

  describe("bicycles & private data", () => {
    it("owners see their bicycles; others and anon cannot read the base table", async () => {
      await as(ALICE, async (q) => {
        expect((await q("select id from bicycles")).rowCount).toBe(2);
      });
      await as(BOB, async (q) => {
        expect((await q("select id from bicycles where owner_id = $1", [ALICE])).rowCount).toBe(0);
      });
      await as(null, async (q) => {
        await denied(q("select id from bicycles"));
      });
    });

    it("serial number / purchase data is never readable by others or anon", async () => {
      await as(BOB, async (q) => {
        expect((await q("select * from bicycle_private_details")).rowCount).toBe(0);
      });
      await as(null, async (q) => {
        await denied(q("select * from bicycle_private_details"));
      });
      await as(ALICE, async (q) => {
        expect((await q("select serial_number from bicycle_private_details")).rows[0].serial_number).toBe("WTU-SECRET-1");
      });
    });

    it("cannot create bicycles for someone else or transfer ownership", () =>
      as(BOB, async (q) => {
        await denied(q("insert into bicycles (owner_id, slug, name) values ($1, 'stolen', 'x')", [ALICE]));
        await denied(q("update bicycles set owner_id = $1 where id = $2", [ALICE, bobPublicBike]));
        expect((await q("update bicycles set name = 'pwned' where id = $1", [alicePublicBike])).rowCount).toBe(0);
        expect((await q("delete from bicycles where id = $1", [alicePublicBike])).rowCount).toBe(0);
      }));

    it("cannot spoof owner_id on child rows", () =>
      as(BOB, async (q) => {
        await denied(q("insert into bicycle_private_details (bicycle_id, owner_id) values ($1, $2)", [alicePrivateBike, ALICE]));
        await denied(q("insert into bicycle_private_details (bicycle_id, owner_id) values ($1, $2)", [alicePrivateBike, BOB]));
        await denied(q("insert into bicycle_images (bicycle_id, owner_id, storage_path) values ($1, $2, 'x')", [alicePrivateBike, BOB]));
      }));

    it("enforces exactly one primary bicycle per owner", () =>
      as(ALICE, async (q) => {
        await q("select set_primary_bicycle($1)", [alicePublicBike]);
        await q("select set_primary_bicycle($1)", [alicePrivateBike]);
        const r = await q("select id from bicycles where is_primary");
        expect(r.rows.map((x) => x.id)).toEqual([alicePrivateBike]);
        await denied(q("select set_primary_bicycle($1)", [bobPublicBike]));
      }));
  });

  describe("Digital Bike Passport views", () => {
    it("expose public bicycles only, with owner-controlled masking", () =>
      as(null, async (q) => {
        const r = await q("select slug, estimated_value, weight_kg, owner_username from bicycle_passports order by slug");
        const slugs = r.rows.map((x) => x.slug);
        expect(slugs).toContain("alice-public");
        expect(slugs).toContain("bob-public");
        expect(slugs).not.toContain("alice-private");
        const alice = r.rows.find((x) => x.slug === "alice-public");
        expect(alice.estimated_value).toBeNull(); // passport_show_value defaults to false
        expect(Number(alice.weight_kg)).toBe(8.1);
        expect(Number(r.rows.find((x) => x.slug === "bob-public").estimated_value)).toBe(4200);
      }));

    it("never expose private columns", async () => {
      const cols = (await admin("select column_name from information_schema.columns where table_name = 'bicycle_passports'")).rows.map((r) => r.column_name);
      for (const secret of ["serial_number", "purchase_price", "purchase_date", "private_notes"]) expect(cols).not.toContain(secret);
    });
  });

  describe("configuration & immutable build history", () => {
    it("only the owner can change a configuration, and only via the RPC", async () => {
      const cassette = await componentId("demo-r12-cassette-11-34");
      await as(BOB, async (q) => {
        await denied(q("select apply_bicycle_configuration($1, $2::jsonb)", [alicePublicBike, JSON.stringify([{ slot: "cassette", component_id: cassette }])]));
      });
      await as(ALICE, async (q) => {
        await denied(q("insert into bicycle_components (bicycle_id, slot, component_id) values ($1, 'cassette', $2)", [alicePublicBike, cassette]));
      });
      await as(null, async (q) => {
        await denied(q("select apply_bicycle_configuration($1, $2::jsonb)", [alicePublicBike, JSON.stringify([{ slot: "cassette", component_id: cassette }])]));
      });
    });

    it("creates sequential, immutable revisions with full snapshots", async () => {
      const c12 = await componentId("demo-r12-cassette-11-34");
      const c11 = await componentId("demo-r11-cassette-11-28");
      const frame = await componentId("demo-endurance-carbon-disc-frame");
      await as(ALICE, async (q) => {
        const r1 = (await q("select * from apply_bicycle_configuration($1, $2::jsonb, 'Initial build')", [alicePrivateBike, JSON.stringify([{ slot: "frame", component_id: frame }, { slot: "cassette", component_id: c12 }])])).rows[0];
        expect(r1.revision_number).toBe(1);
        expect(r1.previous_configuration).toEqual({});
        expect(Object.keys(r1.new_configuration).sort()).toEqual(["cassette", "frame"]);
        expect(r1.created_by).toBe(ALICE);

        const r2 = (await q("select * from apply_bicycle_configuration($1, $2::jsonb, 'Climbing cassette')", [alicePrivateBike, JSON.stringify([{ slot: "cassette", component_id: c11 }])])).rows[0];
        expect(r2.revision_number).toBe(2);
        expect(r2.changes).toHaveLength(1);
        expect(r2.changes[0]).toMatchObject({ slot: "cassette", action: "replaced", from: { name: "Demo R12 Cassette 11–34" }, to: { name: "Demo R11 Cassette 11–28" } });
        expect(r2.previous_configuration.cassette.component_id).toBe(c12);

        const r3 = (await q("select * from apply_bicycle_configuration($1, $2::jsonb)", [alicePrivateBike, JSON.stringify([{ slot: "cassette", remove: true }, { slot: "pedals", custom_name: "Old flats" }])])).rows[0];
        expect(r3.changes.map((c: { slot: string; action: string }) => `${c.slot}:${c.action}`)).toEqual(["cassette:removed", "pedals:added"]);

        // No-op changes are rejected rather than creating empty revisions.
        await denied(q("select apply_bicycle_configuration($1, $2::jsonb)", [alicePrivateBike, JSON.stringify([{ slot: "pedals", custom_name: "Old flats" }])]), /unchanged/);
        // Revisions cannot be edited or forged.
        await denied(q("update bicycle_build_revisions set description = 'rewritten' where bicycle_id = $1", [alicePrivateBike]));
        await denied(q("insert into bicycle_build_revisions (build_id, bicycle_id, revision_number, previous_configuration, new_configuration, changes) select build_id, bicycle_id, 99, '{}', '{}', '[]' from bicycle_build_revisions limit 1"));
        expect((await q("select count(*)::int n from bicycle_build_revisions where bicycle_id = $1", [alicePrivateBike])).rows[0].n).toBe(3);
      });
    });

    it("rejects parts whose category does not fit the slot", async () => {
      const chain = await componentId("demo-r12-chain");
      await as(ALICE, async (q) => {
        await denied(q("select apply_bicycle_configuration($1, $2::jsonb)", [alicePrivateBike, JSON.stringify([{ slot: "saddle", component_id: chain }])]), /does not fit slot/);
      });
    });

    it("revisions of private bicycles are invisible to others", () =>
      as(BOB, async (q) => {
        expect((await q("select * from bicycle_build_revisions where bicycle_id = $1", [alicePrivateBike])).rowCount).toBe(0);
        expect((await q("select * from passport_revisions where bicycle_id = $1", [alicePrivateBike])).rowCount).toBe(0);
      }));
  });

  describe("component registry", () => {
    it("is publicly readable but not writable by anon", () =>
      as(null, async (q) => {
        expect((await q("select count(*)::int n from component_catalog")).rows[0].n).toBeGreaterThan(40);
        await denied(q("insert into components (slug, brand_id, category_id, name) select 'x', brand_id, category_id, 'x' from components limit 1"));
      }));

    it("riders submit unverified parts and edit only their own submissions", async () => {
      const demo = await componentId("demo-r12-chain");
      await as(ALICE, async (q) => {
        const r = await q(
          "insert into components (slug, brand_id, category_id, name, created_by) select 'alice-chain', brand_id, category_id, 'Alice chain', $1 from components where slug = 'demo-r12-chain' returning id, verification_status",
          [ALICE],
        );
        expect(r.rows[0].verification_status).toBe("user_submitted");
        await denied(q("insert into components (slug, brand_id, category_id, name, created_by, verification_status, source_url) select 'fake-verified', brand_id, category_id, 'x', $1, 'manufacturer_verified', 'https://x.test' from components limit 1", [ALICE]));
        expect((await q("update components set name = 'tampered' where id = $1", [demo])).rowCount).toBe(0);
        expect((await q("update components set weight_g = 250 where id = $1", [r.rows[0].id])).rowCount).toBe(1);
        await denied(q("update components set verification_status = 'manufacturer_verified', source_url = 'https://x.test' where id = $1", [r.rows[0].id]));
        await denied(q("insert into component_specifications (component_id, spec_key, label, value_text, source) values ($1, 'x', 'X', 'y', 'manufacturer')", [r.rows[0].id]));
        await q("insert into component_specifications (component_id, spec_key, label, value_text, source) values ($1, 'x', 'X', 'y', 'user')", [r.rows[0].id]);
        await denied(q("insert into component_specifications (component_id, spec_key, label, value_text) values ($1, 'x2', 'X', 'y')", [demo]));
      });
    });

    it("components installed on a bicycle cannot be deleted; riders delete only their own submissions", async () => {
      const demo = await componentId("demo-r12-chain");
      await as(ALICE, async (q) => {
        expect((await q("delete from components where id = $1", [demo])).rowCount).toBe(0);
        const own = await q(
          "insert into components (slug, brand_id, category_id, name, created_by) select 'alice-tmp', brand_id, category_id, 'tmp', $1 from components where slug = 'demo-r12-chain' returning id",
          [ALICE],
        );
        expect((await q("delete from components where id = $1", [own.rows[0].id])).rowCount).toBe(1);
      });
      const frame = await componentId("demo-endurance-carbon-disc-frame");
      await admin("insert into bicycle_components (bicycle_id, slot, component_id) values ($1, 'frame', $2)", [bobPublicBike, frame]);
      try {
        await as(MOD, async (q) => {
          // Installed on a bicycle → protected by ON DELETE RESTRICT, even for moderators.
          await denied(q("delete from components where id = $1", [frame]), /foreign key|violates/);
        });
      } finally {
        await admin("delete from bicycle_components where bicycle_id = $1", [bobPublicBike]);
      }
    });

    it("moderators can verify and edit any component", async () => {
      const demo = await componentId("demo-r12-chain");
      await as(MOD, async (q) => {
        expect((await q("update components set description = 'checked' where id = $1", [demo])).rowCount).toBe(1);
      });
    });
  });

  describe("community", () => {
    it("posts: authors own their content; links must be own public bicycles", async () => {
      await as(ALICE, async (q) => {
        await q("insert into community_posts (author_id, title, bicycle_id) values ($1, 'My build', $2)", [ALICE, alicePublicBike]);
        await denied(q("insert into community_posts (author_id, title, bicycle_id) values ($1, 'Private', $2)", [ALICE, alicePrivateBike]));
        await denied(q("insert into community_posts (author_id, title, bicycle_id) values ($1, 'Not mine', $2)", [ALICE, bobPublicBike]));
        await denied(q("insert into community_posts (author_id, title) values ($1, 'Impersonation')", [BOB]));
        await denied(q("insert into community_posts (author_id, title, is_featured) values ($1, 'Self-featured', true)", [ALICE]));
      });
    });

    it("likes, comments, edits and deletes respect ownership", async () => {
      const post = (await admin("insert into community_posts (author_id, title) values ($1, 'Hello') returning id", [ALICE])).rows[0].id;
      try {
        await as(BOB, async (q) => {
          await q("insert into post_likes (post_id, user_id) values ($1, $2)", [post, BOB]);
          await denied(q("insert into post_likes (post_id, user_id) values ($1, $2)", [post, BOB]), /duplicate|unique/);
          await denied(q("insert into post_likes (post_id, user_id) values ($1, $2)", [post, ALICE]));
          await q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'Nice')", [post, BOB]);
          expect((await q("update community_posts set title = 'x' where id = $1", [post])).rowCount).toBe(0);
          expect((await q("delete from community_posts where id = $1", [post])).rowCount).toBe(0);
          const feed = await q("select like_count, comment_count, liked_by_me from community_feed where id = $1", [post]);
          expect(feed.rows[0]).toEqual({ like_count: 1, comment_count: 1, liked_by_me: true });
        });
        await as(ALICE, async (q) => {
          expect((await q("update post_comments set body = 'edited' where post_id = $1", [post])).rowCount).toBe(0);
          await denied(q("update community_posts set status = 'published', is_featured = true where id = $1", [post]));
        });
      } finally {
        await admin("delete from community_posts where id = $1", [post]);
      }
    });

    it("hidden posts disappear from the public and block interaction", async () => {
      const post = (await admin("insert into community_posts (author_id, title, status) values ($1, 'Hidden', 'hidden') returning id", [ALICE])).rows[0].id;
      try {
        await as(null, async (q) => {
          expect((await q("select id from community_posts where id = $1", [post])).rowCount).toBe(0);
          expect((await q("select id from community_feed where id = $1", [post])).rowCount).toBe(0);
        });
        await as(BOB, async (q) => {
          await denied(q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'x')", [post, BOB]));
          await denied(q("insert into post_likes (post_id, user_id) values ($1, $2)", [post, BOB]));
        });
        await as(ALICE, async (q) => {
          expect((await q("select id from community_posts where id = $1", [post])).rowCount).toBe(1);
        });
      } finally {
        await admin("delete from community_posts where id = $1", [post]);
      }
    });

    it("follows and bookmarks", () =>
      as(BOB, async (q) => {
        await q("insert into user_follows (follower_id, following_id) values ($1, $2)", [BOB, ALICE]);
        await denied(q("insert into user_follows (follower_id, following_id) values ($1, $1)", [BOB]));
        await denied(q("insert into user_follows (follower_id, following_id) values ($1, $2)", [ALICE, BOB]));
        await q("insert into bookmarks (user_id, bicycle_id) values ($1, $2)", [BOB, alicePublicBike]);
        await denied(q("insert into bookmarks (user_id, bicycle_id) values ($1, $2)", [BOB, alicePrivateBike]));
        const stats = await q("select follower_count, followed_by_me from profile_stats where id = $1", [ALICE]);
        expect(stats.rows[0]).toEqual({ follower_count: 1, followed_by_me: true });
        const pass = await q("select bookmark_count, bookmarked_by_me from bicycle_passports where id = $1", [alicePublicBike]);
        expect(pass.rows[0]).toEqual({ bookmark_count: 1, bookmarked_by_me: true });
      }));

    it("reports are private to the reporter and moderators; only moderators resolve", async () => {
      const post = (await admin("insert into community_posts (author_id, title) values ($1, 'Spammy') returning id", [ALICE])).rows[0].id;
      try {
        const report = (await admin("insert into content_reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam') returning id", [BOB, post])).rows[0].id;
        await as(ALICE, async (q) => {
          expect((await q("select * from content_reports")).rowCount).toBe(0);
          await denied(q("select resolve_report($1, 'dismissed')", [report]));
          await denied(q("select moderate_content('post', $1, 'hidden')", [post]));
          await denied(q("insert into content_reports (reporter_id, target_type, target_id, reason, status) values ($1, 'post', $2, 'spam', 'resolved')", [ALICE, post]));
        });
        await as(MOD, async (q) => {
          expect((await q("select * from content_reports where id = $1", [report])).rowCount).toBe(1);
          await q("select moderate_content('post', $1, 'hidden')", [post]);
          await q("select resolve_report($1, 'resolved', 'Removed')", [report]);
          const r = await q("select status, resolved_by from content_reports where id = $1", [report]);
          expect(r.rows[0]).toEqual({ status: "resolved", resolved_by: MOD });
        });
      } finally {
        await admin("delete from community_posts where id = $1", [post]);
      }
    });
  });

  describe("maintenance", () => {
    it("records are owner-only and publicly exposed only when enabled, without cost/notes", async () => {
      await as(ALICE, async (q) => {
        await q(
          "insert into maintenance_records (bicycle_id, owner_id, maintenance_type, title, performed_on, cost, currency, notes) values ($1, $2, 'brake_bleed', 'Bleed', '2026-01-01', 45, 'EUR', 'private note')",
          [alicePublicBike, ALICE],
        );
        await denied(q("insert into maintenance_records (bicycle_id, owner_id, maintenance_type, title, performed_on) values ($1, $2, 'other', 'x', '2026-01-01')", [bobPublicBike, ALICE]));
        await denied(q("insert into maintenance_records (bicycle_id, owner_id, maintenance_type, title, performed_on, next_due_on) values ($1, $2, 'other', 'x', '2026-01-02', '2026-01-01')", [alicePublicBike, ALICE]), /check|violates/);
        expect((await q("select * from passport_maintenance where bicycle_id = $1", [alicePublicBike])).rowCount).toBe(0);
        await q("update bicycles set passport_show_maintenance = true where id = $1", [alicePublicBike]);
        const pub = await q("select * from passport_maintenance where bicycle_id = $1", [alicePublicBike]);
        expect(pub.rowCount).toBe(1);
        expect(pub.rows[0].cost).toBeNull();
        expect(Object.keys(pub.rows[0])).not.toContain("notes");
      });
      await as(BOB, async (q) => {
        expect((await q("select * from maintenance_records")).rowCount).toBe(0);
      });
    });
  });

  describe("storage policies", () => {
    it("owners upload only into their own bicycle folders", async () => {
      await as(ALICE, async (q) => {
        await q("insert into storage.objects (bucket_id, name) values ('bicycle-media', $1)", [`${ALICE}/${alicePrivateBike}/a.jpg`]);
        await denied(q("insert into storage.objects (bucket_id, name) values ('bicycle-media', $1)", [`${ALICE}/${bobPublicBike}/a.jpg`]));
        await denied(q("insert into storage.objects (bucket_id, name) values ('bicycle-media', $1)", [`${BOB}/${bobPublicBike}/a.jpg`]));
      });
    });

    it("media of private bicycles is unreadable to others; public bicycles' media is readable", async () => {
      await admin("insert into storage.objects (bucket_id, name) values ('bicycle-media', $1), ('bicycle-media', $2)", [
        `${ALICE}/${alicePrivateBike}/secret.jpg`,
        `${ALICE}/${alicePublicBike}/cover.jpg`,
      ]);
      try {
        await as(null, async (q) => {
          const r = await q("select name from storage.objects where bucket_id = 'bicycle-media'");
          const names = r.rows.map((x) => x.name);
          expect(names).toContain(`${ALICE}/${alicePublicBike}/cover.jpg`);
          expect(names).not.toContain(`${ALICE}/${alicePrivateBike}/secret.jpg`);
        });
      } finally {
        // Real Supabase blocks direct deletes from storage tables unless explicitly allowed.
        await admin(`begin; set local storage.allow_delete_query = 'true'; delete from storage.objects where name like '${ALICE}/%'; commit;`);
      }
    });
  });
});
