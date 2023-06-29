import {
    EventStreamContentType,
    fetchEventSource,
  } from '@microsoft/fetch-event-source';
  import useStateReducer from './useStateReducer';
import { Message } from '@/types';
import { useEffect } from 'react';

  type Props = {
    queryAgentURL: string;
    channel?: "dashboard" | "website" | "slack" | "crisp";
    queryBody?: any;
    initHistory: Message[];
  };

  const useAgentChat = ({
    queryAgentURL,
    channel,
    queryBody,
    initHistory
  }: Props) => {
    const [state, setState] = useStateReducer({
      history: (initHistory || []) as { role: 'human' | 'ai'; context: string; id?: string }[],
    });
    
    useEffect(() => {
      if (initHistory) setState({ history: initHistory });
    }, [initHistory]);

    const handleChatSubmit = async (context: string) => {
      if (!context) {
        return;
      }
  
      const history = [...state.history, { role: 'human', context }];
      const nextIndex = history.length;
  
      setState({
        history: history as any,
      });
  
      let answer = '';
      let error = '';
  
      try {
        const ctrl = new AbortController();
        let buffer = '';
  
        await fetchEventSource(queryAgentURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...queryBody,
            user_input: context,
            channel,
          }),
          signal: ctrl.signal,
  
          async onopen(response) {
            if (
              response.ok &&
              response.headers.get('content-type') === EventStreamContentType
            ) {
              return; // everything's good
            } else if (
              response.status >= 400 &&
              response.status < 500 &&
              response.status !== 429
            ) {
              if (response.status === 402) {
                //throw new ApiError(ApiErrorType.USAGE_LIMIT);
              }
              // client-side errors are usually non-retriable:
              //throw new FatalError();
            } else {
              //throw new RetriableError();
            }
          },
          onclose() {
            // if the server closes the connection unexpectedly, retry:
            console.log('onclose');
            //throw new RetriableError();
          },
          onerror(err) {
						throw new Error(err);
          },
          onmessage: (event) => {
            event.data = event.data.replaceAll('\\n', '\n');
            console.log(event, 'event');
            if (event.data === '[DONE]') {
              ctrl.abort();
            } else if (event.data?.startsWith('[ERROR]')) {
              ctrl.abort();
              setState({
                history: [
                  ...history,
                  {
                    role: 'ai',
                    context: event.data.replace('[ERROR]', ''),
                  } as any,
                ],
              });
            } else {
              const h = [...history];
              if (event.data) {
                if (h?.[nextIndex]) {
                  h[nextIndex].context = `${event.data}`;
                } else {
                  h.push({ role: 'ai', context: event.data });
                }
                setState({
                  history: h as any,
                });
              }
              
            }
          },
        });
      } catch (err) {
				setState({
					history: [
						...history,
						{ role: 'ai', context: answer || '请求出错' as string },
					] as any,
				});
        // if (err instanceof ApiError) {
        //   if (err?.message) {
        //     error = err?.message;
  
        //     if (error === ApiErrorType.USAGE_LIMIT) {
        //       answer =
        //         'Usage limit reached. Please upgrade your plan to get higher usage.';
        //     } else {
        //       answer = `Error: ${error}`;
        //     }
        //   } else {
        //     answer = `Error: ${error}`;
        //   }
  
        //   setState({
        //     history: [
        //       ...history,
        //       { from: 'ai', message: answer as string },
        //     ] as any,
        //   });
        // }
      }
    };
    return {
      handleChatSubmit,
      history: state.history,
    };
  };
  
  export default useAgentChat;
  