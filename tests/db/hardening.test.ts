/**
 * Milestone 1 hardening: database-enforced rate limits, the storage-cleanup queue,
 * avatar listing restrictions and component-image URL rules.
 *
 *   DATABASE_URL=postgresql://… npm run test:db
 *
 * Same conventions as rls.test.ts: every test runs in a rolled-back transaction while
 * impersonating the PostgREST roles (anon / authenticated / service_role + JWT claims).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

const CAROL = "d0000000-0000-4000-8000-00000000000d";
const DAVE = "e0000000-0000-4000-8000-00000000000e";
const MOD = "f0000000-0000-4000-8000-00000000000f";

let pool: pg.Pool;
type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;
type Identity = string | null | "service";

/** Run fn as an identity inside a transaction that is always rolled back. */
async function as(who: Identity, fn: (q: Q, become: (next: Identity) => Promise<void>) => Promise<void>) {
  const client = await pool.connect();
  let current: Identity = who;
  const become = async (next: Identity) => {
    current = next;
    await client.query("reset role");
    await client.query(`set local role ${next === "service" ? "service_role" : next ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [next && next !== "service" ? next : ""]);
    await client.query("select set_config('request.jwt.claim.role', $1, true)", [next === "service" ? "service_role" : next ? "authenticated" : "anon"]);
  };
  try {
    await client.query("begin");
    await become(who);
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
    // Superuser access inside the same transaction (to inspect private tables).
    const su: Q = async (sql, params) => {
      await client.query("reset role");
      try {
        return await q(sql, params);
      } finally {
        await become(current);
      }
    };
    Object.assign(q, { su });
    await fn(q, become);
  } finally {
    await client.query("rollback");
    client.release();
  }
}
const su = (q: Q) => (q as Q & { su: Q }).su;
const admin = (sql: string, params?: unknown[]) => pool.query(sql, params);

const rateLimited = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "PT429" });
const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/permission denied|not allowed|not found|violates/i);

let post: string;

d("Milestone 1 hardening", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    await admin("delete from auth.users where id in ($1, $2, $3)", [CAROL, DAVE, MOD]);
    await admin(
      `insert into auth.users (id, email, raw_user_meta_data) values
        ($1, 'carol@test.local', '{"username":"carol_t"}'),
        ($2, 'dave@test.local', '{"username":"dave_t"}'),
        ($3, 'mod2@test.local', '{"username":"mod2_t"}')`,
      [CAROL, DAVE, MOD],
    );
    await admin("update profiles set role = 'moderator' where id = $1", [MOD]);
    post = (await admin("insert into community_posts (author_id, title) values ($1, 'Seed post') returning id", [DAVE])).rows[0].id;
  });

  afterAll(async () => {
    await admin("delete from private.rate_limit_events where user_id in ($1, $2, $3)", [CAROL, DAVE, MOD]);
    await admin("delete from private.storage_cleanup_jobs where owner_id in ($1, $2, $3)", [CAROL, DAVE, MOD]);
    await admin("delete from auth.users where id in ($1, $2, $3)", [CAROL, DAVE, MOD]);
    await pool.end();
  });

  describe("rate limits", () => {
    it("allows 5 posts per 10 minutes, then rejects with PT429 (HTTP 429)", async () => {
      await as(CAROL, async (q) => {
        for (let i = 0; i < 5; i++) await q("insert into community_posts (author_id, title) values ($1, $2)", [CAROL, `Post ${i}`]);
        await rateLimited(q("insert into community_posts (author_id, title) values ($1, 'one too many')", [CAROL]));
      });
    });

    it("limits are per user", async () => {
      await as(CAROL, async (q, become) => {
        for (let i = 0; i < 5; i++) await q("insert into community_posts (author_id, title) values ($1, $2)", [CAROL, `Post ${i}`]);
        await rateLimited(q("insert into community_posts (author_id, title) values ($1, 'blocked')", [CAROL]));
        await become(DAVE);
        await q("insert into community_posts (author_id, title) values ($1, 'still fine')", [DAVE]);
      });
    });

    it("events outside the window no longer count", async () => {
      await as(CAROL, async (q) => {
        await su(q)(
          "insert into private.rate_limit_events (user_id, action, created_at) select $1, 'community_post', now() - interval '11 minutes' from generate_series(1, 5)",
          [CAROL],
        );
        await q("insert into community_posts (author_id, title) values ($1, 'fresh window')", [CAROL]);
      });
    });

    it("the daily limit applies across windows", async () => {
      await as(CAROL, async (q) => {
        await su(q)(
          "insert into private.rate_limit_events (user_id, action, created_at) select $1, 'community_post', now() - interval '2 hours' from generate_series(1, 20)",
          [CAROL],
        );
        await rateLimited(q("insert into community_posts (author_id, title) values ($1, 'over daily')", [CAROL]));
      });
    });

    it("comments: 20 per 10 minutes", async () => {
      await as(CAROL, async (q) => {
        for (let i = 0; i < 20; i++) await q("insert into post_comments (post_id, author_id, body) values ($1, $2, $3)", [post, CAROL, `c${i}`]);
        await rateLimited(q("insert into post_comments (post_id, author_id, body) values ($1, $2, 'spam')", [post, CAROL]));
      });
    });

    it("reports: 10 per hour", async () => {
      await as(CAROL, async (q) => {
        for (let i = 0; i < 10; i++)
          await q("insert into content_reports (reporter_id, target_type, target_id, reason) values ($1, 'post', gen_random_uuid(), 'spam')", [CAROL]);
        await rateLimited(q("insert into content_reports (reporter_id, target_type, target_id, reason) values ($1, 'post', gen_random_uuid(), 'spam')", [CAROL]));
      });
    });

    it("failed inserts do not consume quota (the event rolls back with the row)", async () => {
      await as(CAROL, async (q) => {
        for (let i = 0; i < 8; i++) await expect(q("insert into community_posts (author_id, title) values ($1, '   ')", [CAROL])).rejects.toThrow();
        await q("insert into community_posts (author_id, title) values ($1, 'valid')", [CAROL]);
      });
    });

    it("trusted server writes (service role) are not limited", async () => {
      await as("service", async (q) => {
        for (let i = 0; i < 7; i++) await q("insert into community_posts (author_id, title) values ($1, $2)", [CAROL, `import ${i}`]);
      });
    });

    it("rate-limit state is not reachable through the API roles", async () => {
      for (const who of [CAROL, null] as const) {
        await as(who, async (q) => {
          await denied(q("select * from private.rate_limit_events"));
          await denied(q("delete from private.rate_limit_events"));
          await denied(q("update private.rate_limit_rules set max_events = 1000000"));
        });
      }
    });
  });

  describe("storage cleanup queue", () => {
    const jobs = async (q: Q) =>
      (await su(q)("select bucket, object_path, prefix, reason, status from private.storage_cleanup_jobs where owner_id = $1 order by id", [CAROL])).rows;

    async function makeBike(q: Q) {
      const bike = (await q("insert into bicycles (owner_id, slug, name) values ($1, 'cleanup-bike', 'Cleanup') returning id", [CAROL])).rows[0].id as string;
      const img = (await q("insert into bicycle_images (bicycle_id, owner_id, storage_path) values ($1, $2, $3) returning id", [bike, CAROL, `${CAROL}/${bike}/one.jpg`])).rows[0].id as string;
      const rec = (
        await q("insert into maintenance_records (bicycle_id, owner_id, maintenance_type, title, performed_on) values ($1, $2, 'inspection', 'Check', current_date) returning id", [bike, CAROL])
      ).rows[0].id as string;
      const photo = (await q("insert into maintenance_photos (record_id, owner_id, storage_path) values ($1, $2, $3) returning id", [rec, CAROL, `${CAROL}/${rec}/p.jpg`])).rows[0].id as string;
      return { bike, img, rec, photo };
    }

    it("deleting a bicycle enqueues its media folders in the same transaction", async () => {
      await as(CAROL, async (q) => {
        const { bike, rec } = await makeBike(q);
        await q("delete from bicycles where id = $1", [bike]);
        const rows = await jobs(q);
        expect(rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ bucket: "bicycle-media", prefix: `${CAROL}/${bike}/`, object_path: null, reason: "bicycle_deleted" }),
            expect.objectContaining({ bucket: "maintenance-media", prefix: `${CAROL}/${rec}/`, object_path: null, reason: "maintenance_record_deleted" }),
          ]),
        );
        // Folder jobs cover the cascaded rows: no redundant per-object jobs.
        expect(rows.filter((r) => r.object_path !== null)).toHaveLength(0);
      });
    });

    it("a failed delete enqueues nothing (rolled back together)", async () => {
      await as(CAROL, async (q, become) => {
        const { bike } = await makeBike(q);
        await become(DAVE);
        const r = await q("delete from bicycles where id = $1", [bike]); // RLS: not Dave's bike
        expect(r.rowCount).toBe(0);
        await become(CAROL);
        expect(await jobs(q)).toHaveLength(0);
      });
    });

    it("deleting a single image, photo or record enqueues exactly that object/folder", async () => {
      await as(CAROL, async (q) => {
        const { bike, img, rec, photo } = await makeBike(q);
        await q("delete from bicycle_images where id = $1", [img]);
        await q("delete from maintenance_photos where id = $1", [photo]);
        await q("delete from maintenance_records where id = $1", [rec]);
        expect(await jobs(q)).toEqual([
          expect.objectContaining({ bucket: "bicycle-media", object_path: `${CAROL}/${bike}/one.jpg`, reason: "bicycle_image_deleted" }),
          expect.objectContaining({ bucket: "maintenance-media", object_path: `${CAROL}/${rec}/p.jpg`, reason: "maintenance_photo_deleted" }),
          expect.objectContaining({ bucket: "maintenance-media", prefix: `${CAROL}/${rec}/`, reason: "maintenance_record_deleted" }),
        ]);
      });
    });

    it("replacing or removing an avatar enqueues the previous object", async () => {
      await as(CAROL, async (q) => {
        await q("update profiles set avatar_path = $1 where id = $2", [`${CAROL}/a1.png`, CAROL]);
        await q("update profiles set avatar_path = $1 where id = $2", [`${CAROL}/a2.png`, CAROL]);
        await q("update profiles set bio = 'unchanged avatar' where id = $1", [CAROL]);
        await q("update profiles set avatar_path = null where id = $1", [CAROL]);
        expect((await jobs(q)).map((j) => j.object_path)).toEqual([`${CAROL}/a1.png`, `${CAROL}/a2.png`]);
      });
    });

    it("pending jobs are de-duplicated", async () => {
      await as(CAROL, async (q) => {
        await q("select request_storage_cleanup('bicycle-media', $1)", [`${CAROL}/x/orphan.jpg`]);
        await q("select request_storage_cleanup('bicycle-media', $1)", [`${CAROL}/x/orphan.jpg`]);
        expect(await jobs(q)).toHaveLength(1);
      });
    });

    it("users can only schedule objects inside their own folder", async () => {
      await as(CAROL, async (q) => {
        await denied(q("select request_storage_cleanup('bicycle-media', $1)", [`${DAVE}/bike/photo.jpg`]));
        await denied(q("select request_storage_cleanup('bicycle-media', $1)", [`${CAROL}/../${DAVE}/photo.jpg`]));
        await denied(q("select request_storage_cleanup('other-bucket', $1)", [`${CAROL}/photo.jpg`]));
      });
      await as(null, async (q) => {
        await denied(q("select request_storage_cleanup('bicycle-media', $1)", [`${CAROL}/photo.jpg`]));
      });
    });

    it("constraints confine every job to its owner's folder", async () => {
      await as(CAROL, async (q) => {
        const ins = (path: string | null, prefix: string | null) =>
          su(q)("insert into private.storage_cleanup_jobs (bucket, owner_id, object_path, prefix, reason) values ('bicycle-media', $1, $2, $3, 'test')", [CAROL, path, prefix]);
        await denied(ins(`${DAVE}/bike/a.jpg`, null));
        await denied(ins(null, `${DAVE}/${DAVE}/`));
        await denied(ins(null, `${CAROL}/`)); // would wipe the whole user folder
        await denied(ins(null, `${CAROL}/not-a-uuid/`));
        await denied(ins(`${CAROL}/a/../../b.jpg`, null));
        await denied(ins(`${CAROL}/a.jpg`, `${CAROL}/${CAROL}/`)); // exactly one target
      });
    });

    it("workers: users claim/finish only their own jobs; anon is rejected", async () => {
      await as(CAROL, async (q, become) => {
        await q("select request_storage_cleanup('avatars', $1)", [`${CAROL}/old.png`]);
        await become(DAVE);
        await q("select request_storage_cleanup('avatars', $1)", [`${DAVE}/old.png`]);
        const daveClaim = (await q("select * from claim_storage_cleanup_jobs(10)")).rows;
        expect(daveClaim.map((r) => r.object_path)).toEqual([`${DAVE}/old.png`]);

        await become(CAROL);
        const carolJob = (await q("select * from claim_storage_cleanup_jobs(10)")).rows;
        expect(carolJob.map((r) => r.object_path)).toEqual([`${CAROL}/old.png`]);
        await denied(q("select finish_storage_cleanup_job($1, null)", [daveClaim[0].id]));
        expect((await q("select finish_storage_cleanup_job($1, null) as s", [carolJob[0].id])).rows[0].s).toBe("done");

        await become(null);
        await denied(q("select * from claim_storage_cleanup_jobs(10)"));
      });
    });

    it("a claimed job is leased (not handed out twice) and failures back off, then fail permanently", async () => {
      await as(CAROL, async (q) => {
        await q("select request_storage_cleanup('avatars', $1)", [`${CAROL}/flaky.png`]);
        const [job] = (await q("select * from claim_storage_cleanup_jobs(10)")).rows;
        expect((await q("select * from claim_storage_cleanup_jobs(10)")).rowCount).toBe(0);

        expect((await q("select finish_storage_cleanup_job($1, 'Storage timeout') as s", [job.id])).rows[0].s).toBe("pending");
        const row = (await su(q)("select attempts, last_error, next_attempt_at > now() as later from private.storage_cleanup_jobs where id = $1", [job.id])).rows[0];
        expect(row).toMatchObject({ attempts: 1, last_error: "Storage timeout", later: true });

        await su(q)("update private.storage_cleanup_jobs set attempts = 8, next_attempt_at = now() where id = $1", [job.id]);
        expect((await q("select finish_storage_cleanup_job($1, 'still failing') as s", [job.id])).rows[0].s).toBe("failed");
      });
    });

    it("the service role processes every user's jobs and can requeue failures; users cannot", async () => {
      await as(CAROL, async (q, become) => {
        await q("select request_storage_cleanup('avatars', $1)", [`${CAROL}/s.png`]);
        await become(DAVE);
        await q("select request_storage_cleanup('avatars', $1)", [`${DAVE}/s.png`]);
        await denied(q("select retry_failed_storage_cleanup()"));
        await become("service");
        const claimed = (await q("select * from claim_storage_cleanup_jobs(200)")).rows.map((r) => r.object_path);
        expect(claimed).toEqual(expect.arrayContaining([`${CAROL}/s.png`, `${DAVE}/s.png`]));
        await su(q)("update private.storage_cleanup_jobs set status = 'failed' where object_path = $1", [`${CAROL}/s.png`]);
        expect((await q("select retry_failed_storage_cleanup() as n")).rows[0].n).toBeGreaterThanOrEqual(1);
      });
    });

    it("the queue itself is not reachable through the API roles", async () => {
      for (const who of [CAROL, null] as const) {
        await as(who, async (q) => {
          await denied(q("select * from private.storage_cleanup_jobs"));
          await denied(q("insert into private.storage_cleanup_jobs (bucket, owner_id, prefix, reason) values ('avatars', gen_random_uuid(), null, 'x')"));
        });
      }
    });
  });

  describe("storage & image access", () => {
    it("avatar objects can no longer be listed by everyone", async () => {
      await as(CAROL, async (q, become) => {
        await su(q)("insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)", [`${CAROL}/me.png`, `${DAVE}/me.png`]);
        expect((await q("select name from storage.objects where bucket_id = 'avatars'")).rows.map((r) => r.name)).toEqual([`${CAROL}/me.png`]);
        await become(null);
        expect((await q("select name from storage.objects where bucket_id = 'avatars'")).rowCount).toBe(0);
      });
    });

    it("component images must use https or a site-relative path", async () => {
      await as(MOD, async (q) => {
        const c = (await q("select id from components limit 1")).rows[0].id;
        const add = (u: string) => q("insert into component_images (component_id, url) values ($1, $2)", [c, u]);
        await add("https://cdn.example.com/part.jpg");
        await add("/images/part.jpg");
        await denied(add("http://cdn.example.com/part.jpg"));
        await denied(add("//evil.example.com/part.jpg"));
        await denied(add("javascript:alert(1)"));
      });
    });
  });
});
