import PrivacyFixture from './privacy-fixture';

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const parameters = await searchParams;
  return <PrivacyFixture initialUser={parameters.user === 'b' ? 'b' : 'a'} />;
}
