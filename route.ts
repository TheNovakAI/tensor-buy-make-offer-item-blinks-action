import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ActionError, ActionGetResponse, ActionPostRequest, ActionPostResponse } from '@solana/actions';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getItemDetails } from '../../../api/tensor-api';
import { createBuyNftTransaction, createBidNftTransaction } from './transaction-utils';
import { formatTokenAmount } from '../../../shared/number-formatting-utils';
import {
  actionSpecOpenApiPostRequestBody,
  actionsSpecOpenApiGetResponse,
  actionsSpecOpenApiPostResponse,
} from '../../openapi';

const app = new OpenAPIHono();

app.openapi(createRoute({
  method: 'get',
  path: '/item/{itemId}',
  tags: ['Tensor NFT Actions'],
  request: {
    params: z.object({
      itemId: z.string().openapi({
        param: {
          name: 'itemId',
          in: 'path',
        },
        type: 'string',
        example: '7DVeeik8cDUvHgqrTetG6fcDUHHZ8rW7dFHp1SsohKML',
      }),
    }),
  },
  responses: actionsSpecOpenApiGetResponse,
}), async (c) => {
  const itemId = c.req.param('itemId');
  const itemDetails = await getItemDetails(itemId);
  if (!itemDetails) {
    return c.json(
      {
        message: `Item ${itemId} not found`,
      } satisfies ActionError,
      {
        status: 422,
      },
    );
  }

  const buyNowPriceNetFees = itemDetails.price;
  const uiPrice = buyNowPriceNetFees ? formatTokenAmount(parseInt(buyNowPriceNetFees) / LAMPORTS_PER_SOL) : null;

  return c.json(
    {
      icon: itemDetails.imageUri,
      label: uiPrice ? `${uiPrice} SOL` : 'Make an Offer',
      title: itemDetails.name,
      description: itemDetails.description,
      actions: {
        buy: uiPrice ? { label: 'BUY', price: `${uiPrice} SOL` } : null,
        makeOffer: { label: 'MAKE OFFER' },
      },
    } satisfies ActionGetResponse,
  );
});

app.openapi(createRoute({
  method: 'post',
  path: '/item/{itemId}/buy',
  tags: ['Tensor NFT Actions'],
  request: {
    params: z.object({
      itemId: z.string().openapi({
        param: {
          name: 'itemId',
          in: 'path',
        },
        type: 'string',
        example: '7DVeeik8cDUvHgqrTetG6fcDUHHZ8rW7dFHp1SsohKML',
      }),
    }),
    body: actionSpecOpenApiPostRequestBody,
  },
  responses: actionsSpecOpenApiPostResponse,
}), async (c) => {
  const itemId = c.req.param('itemId');

  try {
    const { account } = (await c.req.json()) as ActionPostRequest;
    const itemDetails = await getItemDetails(itemId);
    if (!itemDetails) {
      return c.json(
        {
          message: `Item ${itemId} not found`,
        } satisfies ActionError,
        {
          status: 422,
        },
      );
    }

    if (!itemDetails.price) {
      return c.json(
        {
          message: `Item ${itemId} is not listed for sale`,
        } satisfies ActionError,
        {
          status: 422,
        },
      );
    }

    const transaction = await createBuyNftTransaction(itemDetails.mint, account);

    if (!transaction) {
      throw new Error('Failed to create transaction');
    }

    const response: ActionPostResponse = {
      transaction: transaction,
    };

    return c.json(response);
  } catch (e) {
    console.error(
      `Failed to prepare buy transaction for ${itemId}`,
      e,
    );
    return c.json(
      {
        message: `Failed to prepare transaction`,
      } satisfies ActionError,
      {
        status: 500,
      },
    );
  }
});

app.openapi(createRoute({
  method: 'post',
  path: '/item/{itemId}/offer',
  tags: ['Tensor NFT Actions'],
  request: {
    params: z.object({
      itemId: z.string().openapi({
        param: {
          name: 'itemId',
          in: 'path',
        },
        type: 'string',
        example: '7DVeeik8cDUvHgqrTetG6fcDUHHZ8rW7dFHp1SsohKML',
      }),
    }),
    body: z.object({
      account: z.string().openapi({
        description: 'The Solana account making the offer',
        example: 'YourSolanaAccountHere',
      }),
      offerAmount: z.number().openapi({
        description: 'The amount of the offer in SOL',
        example: 1.5,
      }),
    }).openapi({
      required: ['account', 'offerAmount'],
    }),
  },
  responses: actionsSpecOpenApiPostResponse,
}), async (c) => {
  const itemId = c.req.param('itemId');

  try {
    const { account, offerAmount } = (await c.req.json()) as { account: string, offerAmount: number };
    const itemDetails = await getItemDetails(itemId);
    if (!itemDetails) {
      return c.json(
        {
          message: `Item ${itemId} not found`,
        } satisfies ActionError,
        {
          status: 422,
        },
      );
    }

    const transaction = await createBidNftTransaction(itemDetails.mint, account, offerAmount);

    if (!transaction) {
      throw new Error('Failed to create transaction');
    }

    const response: ActionPostResponse = {
      transaction: transaction,
    };

    return c.json(response);
  } catch (e) {
    console.error(
      `Failed to prepare offer transaction for ${itemId}`,
      e,
    );
    return c.json(
      {
        message: `Failed to prepare transaction`,
      } satisfies ActionError,
      {
        status: 500,
      },
    );
  }
});

export default app;
