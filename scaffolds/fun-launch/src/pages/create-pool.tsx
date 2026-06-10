import { useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { z } from 'zod';
import Header from '../components/Header';

import { useForm } from '@tanstack/react-form';
import { Button } from '@/components/ui/button';
import { Connection } from '@solana/web3.js';
import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import { toast } from 'sonner';
import { QUOTE_CONFIGS } from '@/lib/curve/constants';
import { buildLaunchTransactions } from '@/lib/curve/launch';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

// Define the schema for form validation
const poolSchema = z.object({
  tokenName: z.string().min(3, 'Token name must be at least 3 characters'),
  tokenSymbol: z.string().min(1, 'Token symbol is required'),
  tokenLogo: z.instanceof(File, { message: 'Token logo is required' }).optional(),
  description: z.string().optional(),
  website: z.string().url({ message: 'Please enter a valid URL' }).optional().or(z.literal('')),
  twitter: z.string().url({ message: 'Please enter a valid URL' }).optional().or(z.literal('')),
});

interface FormValues {
  tokenName: string;
  tokenSymbol: string;
  tokenLogo: File | undefined;
  description?: string;
  website?: string;
  twitter?: string;
}

export default function CreatePool() {
  const { publicKey, signAllTransactions } = useWallet();
  const address = useMemo(() => publicKey?.toBase58(), [publicKey]);
  const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), []);

  const [isLoading, setIsLoading] = useState(false);
  const [createdMint, setCreatedMint] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      tokenName: '',
      tokenSymbol: '',
      tokenLogo: undefined,
      description: '',
      website: '',
      twitter: '',
    } as FormValues,
    onSubmit: async ({ value }) => {
      try {
        setIsLoading(true);
        const { tokenLogo } = value;
        if (!tokenLogo) {
          toast.error('Token logo is required');
          return;
        }

        if (!publicKey || !signAllTransactions) {
          toast.error('Wallet not connected');
          return;
        }

        const reader = new FileReader();
        const base64File = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(tokenLogo);
        });

        // Build the launch bundle first so we know the mint, then upload
        // image + metadata to Vercel Blob under that mint.
        const { mintKeypair } = await buildLaunchTransactions({
          connection,
          creator: publicKey,
          name: value.tokenName,
          symbol: value.tokenSymbol,
          // metadata json lives at a deterministic blob path; uploaded below
          uri: '',
        });

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenLogo: base64File,
            mint: mintKeypair.publicKey.toBase58(),
            tokenName: value.tokenName,
            tokenSymbol: value.tokenSymbol,
            description: value.description,
            userWallet: address,
          }),
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error);
        }

        const { metadataUrl } = await uploadResponse.json();

        // Rebuild with the real metadata URI (fresh blockhash included).
        const rebuilt = await buildLaunchTransactions({
          connection,
          creator: publicKey,
          name: value.tokenName,
          symbol: value.tokenSymbol,
          uri: metadataUrl,
        });

        // ONE wallet approval for the whole launch:
        // mint + metadata + 5B mint-to + 5 curves + revoke mint authority.
        const signed = await signAllTransactions(rebuilt.transactions);

        const sendResponse = await fetch('/api/send-bundle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions: signed.map((tx) => tx.serialize().toString('base64')),
          }),
        });

        if (!sendResponse.ok) {
          const error = await sendResponse.json();
          throw new Error(error.error);
        }

        const { success } = await sendResponse.json();
        if (success) {
          toast.success('Coin launched on all five curves; mint authority revoked');
          setCreatedMint(rebuilt.mintKeypair.publicKey.toBase58());
        }
      } catch (error) {
        console.error('Error creating coin:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to create coin');
      } finally {
        setIsLoading(false);
      }
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = poolSchema.safeParse(value);
        if (!result.success) {
          return result.error.formErrors.fieldErrors;
        }
        return undefined;
      },
    },
  });

  return (
    <>
      <Head>
        <title>Create Coin - Fun Launch</title>
        <meta
          name="description"
          content="Launch a coin on five bonding curves at once: SOL, USDC, USDT and more."
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-b text-white">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10">
            <div>
              <h1 className="text-4xl font-bold mb-2">Create Coin</h1>
              <p className="text-gray-300">
                One approval launches your coin on five bonding curves. You keep mint authority
                only for the duration of the bundle — it is revoked in the final transaction.
              </p>
            </div>
          </div>

          {/* Curve targets */}
          <div className="bg-white/5 rounded-xl p-6 backdrop-blur-sm border border-white/10 mb-8">
            <h2 className="text-xl font-bold mb-3">Launch curves (1B tokens each)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
              {QUOTE_CONFIGS.map((q) => (
                <div key={q.mint.toBase58()} className="bg-white/5 rounded-lg p-3">
                  <div className="font-semibold">{q.symbol}</div>
                  <div className="text-gray-400">
                    target mcap {q.targetMarketCap.toLocaleString()} {q.symbol}
                  </div>
                  {q.hasTransferFee && (
                    <div className="text-amber-400 text-xs mt-1">Token-2022 transfer fee</div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-xs mt-3">
              Trade fee 1%, split 50/50 between you (the creator) and the platform, paid in the
              curve&apos;s quote token.
            </p>
          </div>

          {createdMint && !isLoading ? (
            <CoinCreationSuccess mint={createdMint} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
              className="space-y-8"
            >
              {/* Token Details Section */}
              <div className="bg-white/5 rounded-xl p-8 backdrop-blur-sm border border-white/10">
                <h2 className="text-2xl font-bold mb-4">Token Details</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="mb-4">
                      <label
                        htmlFor="tokenName"
                        className="block text-sm font-medium text-gray-300 mb-1"
                      >
                        Token Name*
                      </label>
                      {form.Field({
                        name: 'tokenName',
                        children: (field) => (
                          <input
                            id="tokenName"
                            name={field.name}
                            type="text"
                            className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white"
                            placeholder="e.g. Virtual Coin"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            required
                            minLength={3}
                          />
                        ),
                      })}
                    </div>

                    <div className="mb-4">
                      <label
                        htmlFor="tokenSymbol"
                        className="block text-sm font-medium text-gray-300 mb-1"
                      >
                        Token Symbol*
                      </label>
                      {form.Field({
                        name: 'tokenSymbol',
                        children: (field) => (
                          <input
                            id="tokenSymbol"
                            name={field.name}
                            type="text"
                            className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white"
                            placeholder="e.g. VRTL"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            required
                            maxLength={10}
                          />
                        ),
                      })}
                    </div>

                    <div className="mb-4">
                      <label
                        htmlFor="description"
                        className="block text-sm font-medium text-gray-300 mb-1"
                      >
                        Description
                      </label>
                      {form.Field({
                        name: 'description',
                        children: (field) => (
                          <textarea
                            id="description"
                            name={field.name}
                            className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white"
                            placeholder="What is this coin about?"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            rows={3}
                          />
                        ),
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="tokenLogo"
                      className="block text-sm font-medium text-gray-300 mb-1"
                    >
                      Token Logo*
                    </label>
                    {form.Field({
                      name: 'tokenLogo',
                      children: (field) => (
                        <div className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center">
                          <span className="iconify w-6 h-6 mx-auto mb-2 text-gray-400 ph--upload-bold" />
                          <p className="text-gray-400 text-xs mb-2">PNG, JPG or SVG (max. 2MB)</p>
                          <input
                            type="file"
                            id="tokenLogo"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                field.handleChange(file);
                              }
                            }}
                          />
                          <label
                            htmlFor="tokenLogo"
                            className="bg-white/10 px-4 py-2 rounded-lg text-sm hover:bg-white/20 transition cursor-pointer"
                          >
                            Browse Files
                          </label>
                          {field.state.value && (
                            <p className="text-gray-300 text-xs mt-2">{field.state.value.name}</p>
                          )}
                        </div>
                      ),
                    })}
                  </div>
                </div>
              </div>

              {/* Social Links Section */}
              <div className="bg-white/5 rounded-xl p-8 backdrop-blur-sm border border-white/10">
                <h2 className="text-2xl font-bold mb-6">Social Links (Optional)</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="mb-4">
                    <label
                      htmlFor="website"
                      className="block text-sm font-medium text-gray-300 mb-1"
                    >
                      Website
                    </label>
                    {form.Field({
                      name: 'website',
                      children: (field) => (
                        <input
                          id="website"
                          name={field.name}
                          type="url"
                          className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white"
                          placeholder="https://yourwebsite.com"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      ),
                    })}
                  </div>

                  <div className="mb-4">
                    <label
                      htmlFor="twitter"
                      className="block text-sm font-medium text-gray-300 mb-1"
                    >
                      Twitter
                    </label>
                    {form.Field({
                      name: 'twitter',
                      children: (field) => (
                        <input
                          id="twitter"
                          name={field.name}
                          type="url"
                          className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white"
                          placeholder="https://twitter.com/yourusername"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      ),
                    })}
                  </div>
                </div>
              </div>

              {form.state.errors && form.state.errors.length > 0 && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 space-y-2">
                  {form.state.errors.map((error, index) =>
                    Object.entries(error || {}).map(([, value]) => (
                      <div key={index} className="flex items-start gap-2">
                        <p className="text-red-200">
                          {Array.isArray(value)
                            ? value.map((v: any) => v.message || v).join(', ')
                            : typeof value === 'string'
                              ? value
                              : String(value)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <SubmitButton isSubmitting={isLoading} />
              </div>
            </form>
          )}
        </main>
      </div>
    </>
  );
}

const SubmitButton = ({ isSubmitting }: { isSubmitting: boolean }) => {
  const { publicKey } = useWallet();
  const { setShowModal } = useUnifiedWalletContext();

  if (!publicKey) {
    return (
      <Button type="button" onClick={() => setShowModal(true)}>
        <span>Connect Wallet</span>
      </Button>
    );
  }

  return (
    <Button className="flex items-center gap-2" type="submit" disabled={isSubmitting}>
      {isSubmitting ? (
        <>
          <span className="iconify ph--spinner w-5 h-5 animate-spin" />
          <span>Launching Coin...</span>
        </>
      ) : (
        <>
          <span className="iconify ph--rocket-bold w-5 h-5" />
          <span>Launch Coin (1 approval)</span>
        </>
      )}
    </Button>
  );
};

const CoinCreationSuccess = ({ mint }: { mint: string }) => {
  return (
    <>
      <div className="bg-white/5 rounded-xl p-8 backdrop-blur-sm border border-white/10 text-center">
        <div className="bg-green-500/20 p-4 rounded-full inline-flex mb-6">
          <span className="iconify ph--check-bold w-12 h-12 text-green-500" />
        </div>
        <h2 className="text-3xl font-bold mb-4">Coin Launched!</h2>
        <p className="text-gray-300 mb-2 max-w-lg mx-auto">
          Your coin is live on all five bonding curves and mint authority has been revoked.
        </p>
        <p className="text-gray-400 mb-8 text-sm break-all">Mint: {mint}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/token/${mint}`}
            className="bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 rounded-xl font-medium hover:opacity-90 transition"
          >
            Trade it
          </Link>
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="cursor-pointer bg-white/10 px-6 py-3 rounded-xl font-medium hover:bg-white/20 transition"
          >
            Create Another Coin
          </button>
        </div>
      </div>
    </>
  );
};
