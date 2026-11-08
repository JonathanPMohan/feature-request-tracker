/**
 * Safety lock for integration tests, which wipe every table.
 *
 * Returns the URL only if its database name ends in "_test". Pointing the tests
 * at the dev database or production by mistake fails loudly instead of
 * deleting real data.
 */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. For local development: cp .env.example .env",
    );
  }

  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against database "${name}": ` +
        'its name must end in "_test", because these tests wipe every table.',
    );
  }

  return url;
}
