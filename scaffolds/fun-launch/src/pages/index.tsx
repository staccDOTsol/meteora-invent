import Explore from '@/components/Explore';
import LaunchedCoins from '@/components/LaunchedCoins';
import Page from '@/components/ui/Page/Page';

export default function Index() {
  return (
    <Page>
      <LaunchedCoins />
      <Explore />
    </Page>
  );
}
