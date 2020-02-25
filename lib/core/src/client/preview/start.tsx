import { navigator, window } from 'global';

import addons, { DecorateStoryFunction, Channel } from '@storybook/addons';
import createChannel from '@storybook/channel-postmessage';
import { ClientApi, ConfigApi, StoryStore } from '@storybook/client-api';
import Events from '@storybook/core-events';

import { initializePath, setPath } from './url';
import { RenderStoryFunction } from './types';
import { makeConfigure } from './makeConfigure';
import { StoryRenderer } from './StoryRenderer';

const isBrowser =
  navigator &&
  navigator.userAgent &&
  navigator.userAgent !== 'storyshots' &&
  !(navigator.userAgent.indexOf('Node.js') > -1) &&
  !(navigator.userAgent.indexOf('jsdom') > -1);

function getOrCreateChannel() {
  let channel = null;
  if (isBrowser) {
    try {
      channel = addons.getChannel();
    } catch (e) {
      channel = createChannel({ page: 'preview' });
      addons.setChannel(channel);
    }
  }

  return channel;
}

function getClientApi(channel: Channel, decorateStory: DecorateStoryFunction) {
  let storyStore: StoryStore;
  let clientApi: ClientApi;
  if (
    typeof window !== 'undefined' &&
    window.__STORYBOOK_CLIENT_API__ &&
    window.__STORYBOOK_STORY_STORE__
  ) {
    clientApi = window.__STORYBOOK_CLIENT_API__;
    storyStore = window.__STORYBOOK_STORY_STORE__;
  } else {
    storyStore = new StoryStore({ channel });
    clientApi = new ClientApi({ storyStore, decorateStory });
  }
  return { clientApi, storyStore };
}

function focusInInput(event: Event) {
  const target = event.target as Element;
  return /input|textarea/i.test(target.tagName) || target.getAttribute('contenteditable') !== null;
}

// todo improve typings
export default function start(
  render: RenderStoryFunction,
  { decorateStory }: { decorateStory?: DecorateStoryFunction } = {}
) {
  const channel = getOrCreateChannel();
  const { clientApi, storyStore } = getClientApi(channel, decorateStory);
  const { clearDecorators } = clientApi;
  const configApi = new ConfigApi({ clearDecorators, storyStore, channel, clientApi });
  const storyRenderer = new StoryRenderer({ render, channel, storyStore });

  // channel can be null in NodeJS
  if (isBrowser) {
    channel.on(Events.CURRENT_STORY_WAS_SET, setPath);

    // Handle keyboard shortcuts
    window.onkeydown = (event: KeyboardEvent) => {
      if (!focusInInput(event)) {
        // We have to pick off the keys of the event that we need on the other side
        const { altKey, ctrlKey, metaKey, shiftKey, key, code, keyCode } = event;
        channel.emit(Events.PREVIEW_KEYDOWN, {
          event: { altKey, ctrlKey, metaKey, shiftKey, key, code, keyCode },
        });
      }
    };
  }

  storyStore.on(Events.STORY_INIT, () => {
    const { storyId, viewMode } = initializePath(storyStore);

    storyStore.setSelection({ storyId, viewMode });
  });

  if (typeof window !== 'undefined') {
    window.__STORYBOOK_CLIENT_API__ = clientApi;
    window.__STORYBOOK_STORY_STORE__ = storyStore;
    window.__STORYBOOK_ADDONS_CHANNEL__ = channel; // may not be defined
  }

  const configure = makeConfigure({ clientApi, storyStore, configApi });
  return { configure, clientApi, configApi, forceReRender: () => storyRenderer.forceReRender() };
}
