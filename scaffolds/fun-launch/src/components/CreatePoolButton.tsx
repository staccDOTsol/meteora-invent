import Link from 'next/link';
import { Button } from './ui/button';

type CreatePoolButtonProps = {
  className?: string;
};

export const CreatePoolButton = ({ className }: CreatePoolButtonProps) => {
  return (
    <Button className={className}>
      <Link href="/create-pool" className="flex items-center gap-1">
        <span className="iconify ph--rocket-bold w-4 h-4" />
        <span>Create Coin</span>
      </Link>
    </Button>
  );
};
