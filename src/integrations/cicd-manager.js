/**
 * FlowScribe CI/CD Integration Manager
 * Handles integration with popular CI/CD platforms
 * Generates workflow files and deployment configurations
 */

class CICDManager {
  constructor() {
    this.supportedPlatforms = {
      'github-actions': {
        name: 'GitHub Actions',
        configFile: '.github/workflows/tests.yml',
        icon: '🐙',
        features: ['matrix-testing', 'parallel-execution', 'artifacts', 'notifications']
      },
      'gitlab-ci': {
        name: 'GitLab CI',
        configFile: '.gitlab-ci.yml',
        icon: '🦊',
        features: ['parallel-execution', 'artifacts', 'notifications', 'environments']
      },
      'jenkins': {
        name: 'Jenkins',
        configFile: 'Jenkinsfile',
        icon: '👨‍🔧',
        features: ['pipeline-as-code', 'parallel-execution', 'artifacts']
      },
      'azure-devops': {
        name: 'Azure DevOps',
        configFile: 'azure-pipelines.yml',
        icon: '☁️',
        features: ['matrix-testing', 'parallel-execution', 'artifacts']
      },
      'circleci': {
        name: 'CircleCI',
        configFile: '.circleci/config.yml',
        icon: '⭕',
        features: ['parallel-execution', 'docker', 'artifacts']
      }
    };

    this.testFrameworks = {
      playwright: {
        dockerImage: 'mcr.microsoft.com/playwright:focal',
        installCommand: 'npx playwright install',
        runCommand: 'npx playwright test',
        reportPath: 'playwright-report/'
      },
      cypress: {
        dockerImage: 'cypress/included:latest',
        installCommand: 'npm ci',
        runCommand: 'npx cypress run',
        reportPath: 'cypress/reports/'
      },
      selenium: {
        dockerImage: 'selenium/standalone-chrome:latest',
        installCommand: 'pip install -r requirements.txt',
        runCommand: 'python -m pytest tests/',
        reportPath: 'reports/'
      },
      puppeteer: {
        dockerImage: 'node:16',
        installCommand: 'npm ci',
        runCommand: 'npm test',
        reportPath: 'test-results/'
      }
    };
  }

  /**
   * Generate CI/CD configuration for specified platform
   */
  generateCICDConfig(platform, options = {}) {
    const config = {
      framework: options.framework || 'playwright',
      browsers: options.browsers || ['chromium', 'firefox', 'webkit'],
      nodeVersion: options.nodeVersion || '18',
      parallel: options.parallel || true,
      notifications: options.notifications || false,
      artifacts: options.artifacts || true,
      schedule: options.schedule || null,
      environments: options.environments || ['test', 'staging']
    };

    switch (platform) {
      case 'github-actions':
        return this.generateGitHubActionsConfig(config);
      case 'gitlab-ci':
        return this.generateGitLabCIConfig(config);
      case 'jenkins':
        return this.generateJenkinsConfig(config);
      case 'azure-devops':
        return this.generateAzureDevOpsConfig(config);
      case 'circleci':
        return this.generateCircleCIConfig(config);
      default:
        throw new Error(`Unsupported CI/CD platform: ${platform}`);
    }
  }

  /**
   * GitHub Actions workflow configuration
   */
  generateGitHubActionsConfig(config) {
    const framework = this.testFrameworks[config.framework];
    
    return {
      filename: '.github/workflows/flowscribe-tests.yml',
      content: `name: FlowScribe E2E Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]${config.schedule ? `
  schedule:
    - cron: '${config.schedule}'` : ''}

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [${config.browsers.map(b => `'${b}'`).join(', ')}]
        
    steps:
    - uses: actions/checkout@v4
    
    - uses: actions/setup-node@v4
      with:
        node-version: ${config.nodeVersion}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Install Playwright Browsers
      run: ${framework.installCommand}
      if: \${{ '${config.framework}' == 'playwright' }}
      
    - name: Run FlowScribe Tests
      run: ${framework.runCommand}
      env:
        BROWSER: \${{ matrix.browser }}
        CI: true
        
    - name: Upload Test Results
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: test-results-\${{ matrix.browser }}
        path: ${framework.reportPath}
        retention-days: 30
        
    - name: Upload Screenshots
      uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: screenshots-\${{ matrix.browser }}
        path: test-results/screenshots/
        retention-days: 7${config.notifications ? `
        
    - name: Notify Slack on Failure
      if: failure()
      uses: 8398a7/action-slack@v3
      with:
        status: failure
        channel: '#qa-alerts'
      env:
        SLACK_WEBHOOK_URL: \${{ secrets.SLACK_WEBHOOK }}` : ''}

  report:
    if: always()
    needs: [test]
    runs-on: ubuntu-latest
    steps:
    - name: Download all artifacts
      uses: actions/download-artifact@v4
      
    - name: Publish Test Report
      uses: dorny/test-reporter@v1
      if: success() || failure()
      with:
        name: FlowScribe Test Results
        path: '**/*-results.xml'
        reporter: java-junit`
    };
  }

  /**
   * GitLab CI configuration
   */
  generateGitLabCIConfig(config) {
    const framework = this.testFrameworks[config.framework];
    
    return {
      filename: '.gitlab-ci.yml',
      content: `# FlowScribe E2E Tests - GitLab CI
image: ${framework.dockerImage}

stages:
  - install
  - test
  - report

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"
  CYPRESS_CACHE_FOLDER: "$CI_PROJECT_DIR/cache/Cypress"

cache:
  paths:
    - .npm/
    - cache/Cypress/
    - node_modules/

install:
  stage: install
  script:
    - npm ci
    - ${framework.installCommand}
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

test:e2e:
  stage: test
  parallel:
    matrix:
      - BROWSER: [${config.browsers.map(b => `"${b}"`).join(', ')}]
  script:
    - ${framework.runCommand}
  artifacts:
    when: always
    paths:
      - ${framework.reportPath}
      - screenshots/
    expire_in: 1 week
    reports:
      junit: ${framework.reportPath}junit.xml

test:report:
  stage: report
  image: registry.gitlab.com/pages/hugo:latest
  dependencies:
    - test:e2e
  script:
    - echo "Generating test report..."
    - mkdir public
    - cp -r ${framework.reportPath}* public/
  artifacts:
    paths:
      - public
  only:
    - main`
    };
  }

  /**
   * Jenkins pipeline configuration
   */
  generateJenkinsConfig(config) {
    const framework = this.testFrameworks[config.framework];
    
    return {
      filename: 'Jenkinsfile',
      content: `// FlowScribe E2E Tests - Jenkins Pipeline
pipeline {
    agent any
    
    parameters {
        choice(
            name: 'BROWSER',
            choices: [${config.browsers.map(b => `'${b}'`).join(', ')}],
            description: 'Browser to run tests on'
        )
        choice(
            name: 'ENVIRONMENT',
            choices: [${config.environments.map(e => `'${e}'`).join(', ')}],
            description: 'Environment to test against'
        )
    }
    
    environment {
        NODE_VERSION = '${config.nodeVersion}'
        CI = 'true'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Setup') {
            steps {
                sh 'npm ci'
                sh '${framework.installCommand}'
            }
        }
        
        stage('Test') {
            parallel {${config.browsers.map(browser => `
                stage('Test ${browser}') {
                    steps {
                        script {
                            env.BROWSER = '${browser}'
                            sh '${framework.runCommand}'
                        }
                    }
                    post {
                        always {
                            archiveArtifacts artifacts: '${framework.reportPath}**/*', fingerprint: true
                            publishHTML([
                                allowMissing: false,
                                alwaysLinkToLastBuild: false,
                                keepAll: true,
                                reportDir: '${framework.reportPath}',
                                reportFiles: 'index.html',
                                reportName: 'Test Report (${browser})'
                            ])
                        }
                    }
                }`).join('')}
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
        failure {
            emailext (
                subject: "FlowScribe Tests Failed: \${env.JOB_NAME} - \${env.BUILD_NUMBER}",
                body: "Build failed. Check console output at \${env.BUILD_URL}",
                to: "\${env.CHANGE_AUTHOR_EMAIL}"
            )
        }
    }
}`
    };
  }

  /**
   * Azure DevOps pipeline configuration
   */
  generateAzureDevOpsConfig(config) {
    const framework = this.testFrameworks[config.framework];
    
    return {
      filename: 'azure-pipelines.yml',
      content: `# FlowScribe E2E Tests - Azure DevOps
trigger:
  branches:
    include:
    - main
    - develop

pr:
  branches:
    include:
    - main

pool:
  vmImage: 'ubuntu-latest'

strategy:
  matrix:${config.browsers.map(browser => `
    ${browser}:
      browserName: '${browser}'`).join('')}

variables:
  node.version: '${config.nodeVersion}'

steps:
- task: NodeTool@0
  displayName: 'Install Node.js'
  inputs:
    versionSpec: '\$(node.version)'

- script: |
    npm ci
    ${framework.installCommand}
  displayName: 'Install dependencies'

- script: ${framework.runCommand}
  displayName: 'Run FlowScribe Tests'
  env:
    BROWSER: \$(browserName)
    CI: true

- task: PublishTestResults@2
  displayName: 'Publish Test Results'
  inputs:
    testResultsFiles: '${framework.reportPath}junit.xml'
    testRunTitle: 'FlowScribe Tests (\$(browserName))'
  condition: always()

- task: PublishBuildArtifacts@1
  displayName: 'Publish Screenshots'
  inputs:
    PathtoPublish: 'screenshots'
    ArtifactName: 'screenshots-\$(browserName)'
  condition: failed()`
    };
  }

  /**
   * CircleCI configuration
   */
  generateCircleCIConfig(config) {
    const framework = this.testFrameworks[config.framework];
    
    return {
      filename: '.circleci/config.yml',
      content: `# FlowScribe E2E Tests - CircleCI
version: 2.1

orbs:
  node: circleci/node@5.0.2

executors:
  test-executor:
    docker:
      - image: ${framework.dockerImage}
    working_directory: ~/project

commands:
  run-tests:
    parameters:
      browser:
        type: string
    steps:
      - checkout
      - node/install-packages:
          cache-path: ~/project/node_modules
          override-ci-command: npm ci
      - run:
          name: Install browsers
          command: ${framework.installCommand}
      - run:
          name: Run tests
          command: ${framework.runCommand}
          environment:
            BROWSER: << parameters.browser >>
            CI: true
      - store_test_results:
          path: ${framework.reportPath}
      - store_artifacts:
          path: ${framework.reportPath}
      - store_artifacts:
          path: screenshots

jobs:${config.browsers.map(browser => `
  test-${browser}:
    executor: test-executor
    steps:
      - run-tests:
          browser: "${browser}"`).join('')}

workflows:
  test-workflow:
    jobs:${config.browsers.map(browser => `
      - test-${browser}`).join('')}`
    };
  }

  /**
   * Generate test configuration files
   */
  generateTestConfig(framework, options = {}) {
    switch (framework) {
      case 'playwright':
        return this.generatePlaywrightConfig(options);
      case 'cypress':
        return this.generateCypressConfig(options);
      case 'selenium':
        return this.generateSeleniumConfig(options);
      case 'puppeteer':
        return this.generatePuppeteerConfig(options);
      default:
        throw new Error(`Unsupported framework: ${framework}`);
    }
  }

  /**
   * Generate Playwright configuration
   */
  generatePlaywrightConfig(options) {
    return {
      filename: 'playwright.config.js',
      content: `// FlowScribe Generated Playwright Configuration
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'playwright-report/junit.xml' }]
  ],
  use: {
    baseURL: '${options.baseUrl || 'http://localhost:3000'}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
});`
    };
  }

  /**
   * Generate Cypress configuration
   */
  generateCypressConfig(options) {
    return {
      filename: 'cypress.config.js',
      content: `// FlowScribe Generated Cypress Configuration
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: '${options.baseUrl || 'http://localhost:3000'}',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    video: true,
    screenshotOnRunFailure: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    
    env: {
      coverage: false
    }
  },

  component: {
    devServer: {
      framework: 'react',
      bundler: 'webpack',
    },
  },
})`
    };
  }

  /**
   * Generate Docker configuration for testing
   */
  generateDockerConfig(framework) {
    const config = this.testFrameworks[framework];
    
    return {
      filename: 'Dockerfile.test',
      content: `# FlowScribe Test Environment
FROM ${config.dockerImage}

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Install test dependencies
RUN ${config.installCommand}

# Copy test files
COPY . .

# Run tests
CMD ["${config.runCommand}"]`
    };
  }

  /**
   * Generate deployment script
   */
  generateDeploymentScript(platform, environment) {
    return {
      filename: `deploy-${environment}.sh`,
      content: `#!/bin/bash
# FlowScribe Deployment Script for ${environment}

set -e

echo "🚀 Deploying FlowScribe tests to ${environment}..."

# Set environment variables
export NODE_ENV=${environment}
export CI=true

# Run tests
npm run test:e2e

# Deploy if tests pass
if [ $? -eq 0 ]; then
  echo "✅ Tests passed! Deploying..."
  # Add deployment commands here
  echo "🎉 Deployment complete!"
else
  echo "❌ Tests failed! Deployment aborted."
  exit 1
fi`
    };
  }

  /**
   * Generate package.json scripts
   */
  generatePackageScripts(framework) {
    const scripts = {
      'test:e2e': this.testFrameworks[framework].runCommand,
      'test:headed': `${this.testFrameworks[framework].runCommand} --headed`,
      'test:debug': `${this.testFrameworks[framework].runCommand} --debug`,
      'test:report': 'npx playwright show-report',
      'ci:install': this.testFrameworks[framework].installCommand,
      'ci:test': `${this.testFrameworks[framework].runCommand} --reporter=junit`
    };

    return scripts;
  }

  /**
   * Export CI/CD configuration as ZIP
   */
  async exportCICDConfig(platform, framework, options = {}) {
    const configs = [];
    
    // Main CI/CD config
    const cicdConfig = this.generateCICDConfig(platform, { ...options, framework });
    configs.push(cicdConfig);
    
    // Test framework config
    const testConfig = this.generateTestConfig(framework, options);
    configs.push(testConfig);
    
    // Docker config
    const dockerConfig = this.generateDockerConfig(framework);
    configs.push(dockerConfig);
    
    // Deployment script
    const deployScript = this.generateDeploymentScript(platform, 'production');
    configs.push(deployScript);

    return {
      configs,
      packageScripts: this.generatePackageScripts(framework),
      platform: this.supportedPlatforms[platform],
      framework: this.testFrameworks[framework]
    };
  }

  /**
   * Get available platforms
   */
  getSupportedPlatforms() {
    return this.supportedPlatforms;
  }

  /**
   * Get platform-specific features
   */
  getPlatformFeatures(platform) {
    return this.supportedPlatforms[platform]?.features || [];
  }

  /**
   * Validate configuration options
   */
  validateConfig(platform, options) {
    const errors = [];
    
    if (!this.supportedPlatforms[platform]) {
      errors.push(`Unsupported platform: ${platform}`);
    }
    
    if (options.framework && !this.testFrameworks[options.framework]) {
      errors.push(`Unsupported framework: ${options.framework}`);
    }
    
    if (options.browsers) {
      const validBrowsers = ['chromium', 'firefox', 'webkit', 'chrome', 'edge'];
      const invalidBrowsers = options.browsers.filter(b => !validBrowsers.includes(b));
      if (invalidBrowsers.length > 0) {
        errors.push(`Invalid browsers: ${invalidBrowsers.join(', ')}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CICDManager;
} else {
  window.CICDManager = CICDManager;
}