import { PageHead } from '@/components/shell/PageHead';
import { StatesShowcase } from './showcase';

export default function Page() {
  return (
    <>
      <PageHead pathname="/states" />
      <StatesShowcase />
    </>
  );
}
