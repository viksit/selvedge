import { selvedge } from '../src';

// Enable debug logging
selvedge.debug("*");

// Register models - this is required before using them
selvedge.models({
  claude: selvedge.anthropic('claude-3-5-haiku-20241022'),
  gpt4: selvedge.openai('gpt-4')
});


// Define the Weather API client interface (what we want to use)
interface WeatherApiClient {
  getCurrentWeather: (city: string, units?: 'standard' | 'metric' | 'imperial') => Promise<any>;
  getForecast: (city: string, units?: 'standard' | 'metric' | 'imperial') => Promise<any>;
}

type ApiClientBuilder = (apiKey: string) => WeatherApiClient;


// Example: Word Counter program
async function main() {
  // console.log("Running word counter example...");
  // const wordCounter = selvedge.program`
  //   /** Write a typescript program that
  //    *  counts word freq only if the word starts with q 
  //    **/
  // `
  //   .returns<{ [word: string]: number }>()
  //   .model('claude')
  //   .options({ forceRegenerate: false })
  //   .persist('word-counter-5');
  // const result = await wordCounter("the quick brown fox jumps over the lazy dog");
  // console.log("Result:", result);
  // console.log("Generated code:", wordCounter.state.generatedCode);


  const apiGenerator = selvedge.program`
    /**
     * Create a fully typed API client for the ${(spec: string) => spec} API.
     * Include error handling, retry logic, and proper typing for all endpoints.
     * The client should support ${(authType: string) => authType} authentication.
     */
    `
    .returns<ApiClientBuilder>()
    .model('claude')
    .options({ forceRegenerate: true })
    .persist('api-generator-5')
    .examples([
      {
        input: {
          spec: 'https://api.openweathermap.org/data/2.5',
          authType: 'apiKey'
        },
        output: `
      // This returns a function that creates the client when given an API key
      (apiKey) => {
        return {
          getCurrentWeather: async (city, units = 'metric') => {
            // Implementation
          },
          getForecast: async (city, units = 'metric') => {
            // Implementation
          }
        };
      }
      `
      }
    ]);

  // Build the client builder function
  const clientBuilder = await apiGenerator({
    spec: 'https://api.openweathermap.org/data/2.5',
    authType: 'apiKey'
  });

  // Now use the builder to create an actual client
  const apiClient = clientBuilder('0da51dba81dc2d70fb81948a0e7c6bbb');

  // Then you can use the client
  const weatherData = await apiClient.getCurrentWeather('New York');
  console.log(weatherData);

}
main().catch(console.error);
